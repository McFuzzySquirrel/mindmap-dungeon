import {
  addCrossLink,
  addLinkedRooms,
  deriveTraversalSnapshot,
  markRoomVisited,
  propagateRevalidationAfterGraphMutation,
  suggestConnectedTopics,
  type GraphDomainResult,
} from "@core/graph";
import type {
  DungeonMetadata,
  RoomMetadata,
  ValidationState,
} from "@core/validation/persistence";
import {
  ROOM_ARTIFACT_FILE_NAME,
  ROOM_NOTE_FILE_NAME,
} from "@services/fileStore/constants";

import type {
  CreatorAddCrossLinkInput,
  CreatorAddLinkedRoomsInput,
  CreatorInitializeInput,
  CreatorResult,
  CreatorState,
  CreatorStateMutationResult,
  CreatorSuggestionOutput,
} from "./types";

function asCreatorResult<T>(result: GraphDomainResult<T>): CreatorResult<T> {
  if (!result.ok) {
    return result;
  }

  return result;
}

function cloneRooms(rooms: Record<string, RoomMetadata>): Record<string, RoomMetadata> {
  return Object.fromEntries(
    Object.entries(rooms).map(([roomId, room]) => [
      roomId,
      {
        ...room,
        validationState: {
          ...room.validationState,
          criterionScores: {
            ...room.validationState.criterionScores,
          },
          failedChecks: [...room.validationState.failedChecks],
        },
        attachments: room.attachments.map((attachment) => ({ ...attachment })),
      },
    ]),
  );
}

function buildDefaultValidationState(): ValidationState {
  return {
    wordCount: 0,
    requiredSectionsPresent: false,
    manualConfirmed: false,
    criterionScores: {
      sectionCompleteness: 0,
      conceptTermCoverage: 0,
      linkReferences: 0,
      recallQuestionQuality: 0,
      clarityReadability: 0,
    },
    failedChecks: ["VAL_WORD_COUNT_TOO_LOW", "VAL_REQUIRED_SECTION_MISSING", "VAL_MANUAL_CONFIRM_REQUIRED"],
    qualityBonus: 0,
    finalPass: false,
  };
}

function createDefaultRoomMetadata(roomId: string, topic: string, nowIso: string): RoomMetadata {
  return {
    roomId,
    topic,
    createdAt: nowIso,
    updatedAt: nowIso,
    state: "Created",
    notePath: ROOM_NOTE_FILE_NAME,
    artifactPath: ROOM_ARTIFACT_FILE_NAME,
    validationState: buildDefaultValidationState(),
    reviewPassCount: 0,
    attachments: [],
  };
}

function applyRoomStatusesToMetadata(
  rooms: Record<string, RoomMetadata>,
  dungeon: DungeonMetadata,
): Record<string, RoomMetadata> {
  const next = cloneRooms(rooms);

  for (const summary of dungeon.rooms) {
    const room = next[summary.roomId];
    if (!room) {
      continue;
    }

    room.state = summary.status;
    room.topic = summary.topic;
    room.updatedAt = dungeon.updatedAt;
  }

  return next;
}

function applyPostScribeRevalidationIfNeeded(
  state: CreatorState,
  touchedRoomIds: readonly string[],
  nowIso: string,
): CreatorResult<{
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
  impactedRoomIds: string[];
  revalidatedRoomIds: string[];
}> {
  const revalidationResult = propagateRevalidationAfterGraphMutation({
    dungeon: state.dungeon,
    touchedRoomIds,
    nowIso,
  });

  if (!revalidationResult.ok) {
    return revalidationResult;
  }

  const nextRooms = applyRoomStatusesToMetadata(state.rooms, revalidationResult.value.dungeon);

  return {
    ok: true,
    value: {
      dungeon: revalidationResult.value.dungeon,
      rooms: nextRooms,
      impactedRoomIds: revalidationResult.value.impactedRoomIds,
      revalidatedRoomIds: revalidationResult.value.revalidatedRoomIds,
    },
  };
}

export function initializeCreatorState(
  input: CreatorInitializeInput,
): CreatorResult<CreatorState> {
  const guidance = deriveTraversalSnapshot(input.loadedSubject.dungeon);

  return {
    ok: true,
    value: {
      dungeon: input.loadedSubject.dungeon,
      rooms: cloneRooms(input.loadedSubject.rooms),
      guidance,
    },
  };
}

export function addLinkedRoomsToCreatorState(
  state: CreatorState,
  input: CreatorAddLinkedRoomsInput,
): CreatorResult<CreatorStateMutationResult> {
  const linkedResult = addLinkedRooms(state.dungeon, {
    ...input,
    createdByPhase: "Creator",
  });

  if (!linkedResult.ok) {
    return linkedResult;
  }

  const nextRooms = cloneRooms(state.rooms);
  for (const createdRoomId of linkedResult.value.createdRoomIds) {
    const summary = linkedResult.value.dungeon.rooms.find((room) => room.roomId === createdRoomId);
    if (!summary) {
      return {
        ok: false,
        error: {
          code: "INVALID_OPERATION",
          message: "Created room summary missing after linked-room mutation.",
          details: { createdRoomId },
        },
      };
    }

    nextRooms[createdRoomId] = createDefaultRoomMetadata(createdRoomId, summary.topic, input.nowIso);
  }

  const revalidation = applyPostScribeRevalidationIfNeeded(
    {
      dungeon: linkedResult.value.dungeon,
      rooms: nextRooms,
      guidance: deriveTraversalSnapshot(linkedResult.value.dungeon),
    },
    linkedResult.value.touchedRoomIds,
    input.nowIso,
  );

  if (!revalidation.ok) {
    return revalidation;
  }

  const nextState: CreatorState = {
    dungeon: revalidation.value.dungeon,
    rooms: revalidation.value.rooms,
    guidance: deriveTraversalSnapshot(revalidation.value.dungeon),
  };

  return {
    ok: true,
    value: {
      state: nextState,
      summary: {
        touchedRoomIds: [...linkedResult.value.touchedRoomIds],
        revalidationImpactedRoomIds: revalidation.value.impactedRoomIds,
        revalidationRevokedRoomIds: revalidation.value.revalidatedRoomIds,
      },
    },
  };
}

export function addCrossLinkToCreatorState(
  state: CreatorState,
  input: CreatorAddCrossLinkInput,
): CreatorResult<CreatorStateMutationResult> {
  const crossLinkResult = addCrossLink(state.dungeon, {
    ...input,
    createdByPhase: "Creator",
  });

  if (!crossLinkResult.ok) {
    return crossLinkResult;
  }

  const revalidation = applyPostScribeRevalidationIfNeeded(
    {
      dungeon: crossLinkResult.value.dungeon,
      rooms: state.rooms,
      guidance: deriveTraversalSnapshot(crossLinkResult.value.dungeon),
    },
    crossLinkResult.value.touchedRoomIds,
    input.nowIso,
  );

  if (!revalidation.ok) {
    return revalidation;
  }

  const nextState: CreatorState = {
    dungeon: revalidation.value.dungeon,
    rooms: revalidation.value.rooms,
    guidance: deriveTraversalSnapshot(revalidation.value.dungeon),
  };

  return {
    ok: true,
    value: {
      state: nextState,
      summary: {
        touchedRoomIds: [...crossLinkResult.value.touchedRoomIds],
        revalidationImpactedRoomIds: revalidation.value.impactedRoomIds,
        revalidationRevokedRoomIds: revalidation.value.revalidatedRoomIds,
      },
    },
  };
}

export function markCreatorRoomVisited(
  state: CreatorState,
  roomId: string,
): CreatorResult<CreatorState> {
  const visitResult = markRoomVisited(state.dungeon, roomId);
  const creatorResult = asCreatorResult(visitResult);
  if (!creatorResult.ok) {
    return creatorResult;
  }

  const nextRooms = applyRoomStatusesToMetadata(state.rooms, creatorResult.value);

  return {
    ok: true,
    value: {
      dungeon: creatorResult.value,
      rooms: nextRooms,
      guidance: deriveTraversalSnapshot(creatorResult.value),
    },
  };
}

export function computeCreatorProgressSets(state: CreatorState) {
  return deriveTraversalSnapshot(state.dungeon);
}

export function applyPostScribeMutationRevalidation(
  state: CreatorState,
  touchedRoomIds: readonly string[],
  nowIso: string,
): CreatorResult<CreatorStateMutationResult> {
  const revalidation = applyPostScribeRevalidationIfNeeded(state, touchedRoomIds, nowIso);
  if (!revalidation.ok) {
    return revalidation;
  }

  const nextState: CreatorState = {
    dungeon: revalidation.value.dungeon,
    rooms: revalidation.value.rooms,
    guidance: deriveTraversalSnapshot(revalidation.value.dungeon),
  };

  return {
    ok: true,
    value: {
      state: nextState,
      summary: {
        touchedRoomIds: [...touchedRoomIds],
        revalidationImpactedRoomIds: revalidation.value.impactedRoomIds,
        revalidationRevokedRoomIds: revalidation.value.revalidatedRoomIds,
      },
    },
  };
}

export function getDeterministicTopicSuggestions(
  state: CreatorState,
  sourceRoomId: string,
  maxSuggestions?: number,
): CreatorResult<CreatorSuggestionOutput> {
  const room = state.dungeon.rooms.find((entry) => entry.roomId === sourceRoomId);
  if (!room) {
    return {
      ok: false,
      error: {
        code: "ROOM_NOT_FOUND",
        message: "Cannot suggest topics for unknown room.",
        details: { sourceRoomId },
      },
    };
  }

  const suggestionInput = {
    sourceTopic: room.topic,
    existingRooms: state.dungeon.rooms,
    ...(maxSuggestions === undefined ? {} : { maxSuggestions }),
  };

  const suggestionsResult = suggestConnectedTopics(suggestionInput);

  if (!suggestionsResult.ok) {
    return suggestionsResult;
  }

  return {
    ok: true,
    value: {
      sourceRoomId,
      suggestions: suggestionsResult.value,
    },
  };
}
