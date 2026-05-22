import { generateRoomArtifact } from "@core/artifacts";
import { evaluateNoteValidation } from "@core/validation/notes";
import type {
  DungeonMetadata,
  DungeonRoomSummary,
  RoomMetadata,
} from "@core/validation/persistence";

import type {
  CreateScribeOrchestratorInput,
  ReviseClearedNoteInput,
  ScribeDomainError,
  ScribeEncounterSummary,
  ScribeOrchestrator,
  ScribeResult,
  ScribeState,
  ScribeSubmissionOutcome,
  SubmitEncounterNoteInput,
} from "./types";

const CLEARED_ROOM_STATES = new Set<RoomMetadata["state"]>([
  "EncounterDefeated",
  "ArtifactCollected",
]);

function asError(
  code: ScribeDomainError["code"],
  message: string,
  details?: Record<string, unknown>,
): ScribeDomainError {
  return {
    code,
    message,
    ...(details ? { details } : {}),
  };
}

function asResultError<T>(
  code: ScribeDomainError["code"],
  message: string,
  details?: Record<string, unknown>,
): ScribeResult<T> {
  return {
    ok: false,
    error: asError(code, message, details),
  };
}

function cloneDungeon(dungeon: DungeonMetadata): DungeonMetadata {
  return {
    ...dungeon,
    rooms: dungeon.rooms.map((room) => ({ ...room })),
    edges: dungeon.edges.map((edge) => ({ ...edge })),
    progression: {
      ...dungeon.progression,
      badges: [...dungeon.progression.badges],
    },
  };
}

function cloneRoom(room: RoomMetadata): RoomMetadata {
  return {
    ...room,
    validationState: {
      ...room.validationState,
      criterionScores: {
        ...room.validationState.criterionScores,
      },
      failedChecks: [...room.validationState.failedChecks],
    },
    attachments: room.attachments.map((attachment) => ({ ...attachment })),
  };
}

function cloneRooms(rooms: Record<string, RoomMetadata>): Record<string, RoomMetadata> {
  return Object.fromEntries(
    Object.entries(rooms).map(([roomId, room]) => [roomId, cloneRoom(room)]),
  );
}

function hasSavedDraft(room: RoomMetadata): boolean {
  return room.state === "NotesDrafted" || room.validationState.wordCount > 0;
}

function isRoomCleared(room: RoomMetadata): boolean {
  return room.validationState.finalPass && CLEARED_ROOM_STATES.has(room.state);
}

function buildEncounterSummary(room: RoomMetadata): ScribeEncounterSummary {
  return {
    roomId: room.roomId,
    topic: room.topic,
    roomState: room.state,
    encounterRequired: true,
    isCleared: isRoomCleared(room),
    hasDraft: hasSavedDraft(room),
    latestFailedChecks: [...room.validationState.failedChecks],
  };
}

function buildEncounterMap(rooms: Record<string, RoomMetadata>): Record<string, ScribeEncounterSummary> {
  return Object.fromEntries(
    Object.values(rooms)
      .sort((left, right) => left.roomId.localeCompare(right.roomId))
      .map((room) => [room.roomId, buildEncounterSummary(room)]),
  );
}

function setDungeonRoomStatus(
  dungeon: DungeonMetadata,
  roomId: string,
  status: DungeonRoomSummary["status"],
): void {
  const summary = dungeon.rooms.find((room) => room.roomId === roomId);
  if (summary) {
    summary.status = status;
  }
}

function allRoomsCleared(rooms: Record<string, RoomMetadata>): boolean {
  const roomValues = Object.values(rooms);
  if (roomValues.length === 0) {
    return false;
  }

  return roomValues.every((room) => isRoomCleared(room));
}

function anyRoomCleared(rooms: Record<string, RoomMetadata>): boolean {
  return Object.values(rooms).some((room) => isRoomCleared(room));
}

function deriveScribePhaseState(rooms: Record<string, RoomMetadata>): DungeonMetadata["phaseState"] {
  if (allRoomsCleared(rooms)) {
    return "ScribeComplete";
  }

  if (anyRoomCleared(rooms)) {
    return "ScribePartial";
  }

  return "ScribeActive";
}

function buildStateFromSnapshot(snapshot: {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
}): ScribeResult<ScribeState> {
  const rooms = cloneRooms(snapshot.rooms);
  const dungeon = cloneDungeon(snapshot.dungeon);

  for (const summary of dungeon.rooms) {
    const room = rooms[summary.roomId];
    if (!room) {
      return asResultError(
        "ENCOUNTER_NOT_SPAWNED",
        "Encounter metadata is missing for one or more dungeon rooms.",
        { roomId: summary.roomId },
      );
    }

    room.topic = summary.topic;
    room.state = summary.status;
  }

  dungeon.phaseState = deriveScribePhaseState(rooms);

  return {
    ok: true,
    value: {
      dungeon,
      rooms,
      encountersByRoomId: buildEncounterMap(rooms),
    },
  };
}

function applyValidationToRoom(
  room: RoomMetadata,
  validation: ReturnType<typeof evaluateNoteValidation>,
): void {
  room.validationState = {
    wordCount: validation.wordCount,
    requiredSectionsPresent: validation.requiredSectionsPresent,
    manualConfirmed: validation.manualConfirmed,
    criterionScores: {
      ...validation.criterionScores,
    },
    failedChecks: [...validation.failedChecks],
    qualityBonus: validation.qualityBonus,
    finalPass: validation.finalPass,
  };
}

async function saveState(
  persistence: CreateScribeOrchestratorInput["persistence"],
  dungeon: DungeonMetadata,
  room: RoomMetadata,
): Promise<void> {
  await persistence.saveRoom(room);
  await persistence.saveDungeon(dungeon);
}

async function submitInternal(
  persistence: CreateScribeOrchestratorInput["persistence"],
  input: SubmitEncounterNoteInput | ReviseClearedNoteInput,
  mode: "submit" | "revise",
): Promise<ScribeResult<ScribeSubmissionOutcome>> {
  let snapshot;
  try {
    snapshot = await persistence.loadDungeon();
  } catch (error) {
    return asResultError("PERSISTENCE_ERROR", "Failed to load subject snapshot.", {
      cause: error instanceof Error ? error.message : "unknown",
    });
  }

  const stateResult = buildStateFromSnapshot(snapshot);
  if (!stateResult.ok) {
    return stateResult;
  }

  const state = stateResult.value;
  const room = state.rooms[input.roomId];
  if (!room) {
    return asResultError("ROOM_NOT_FOUND", "Encounter room was not found.", {
      roomId: input.roomId,
    });
  }

  const previouslyCleared = isRoomCleared(room);
  if (mode === "revise" && !previouslyCleared) {
    return asResultError(
      "INVALID_OPERATION",
      "Note revision after completion requires a previously cleared room.",
      { roomId: input.roomId },
    );
  }

  try {
    await persistence.saveRoomNote(input.roomId, input.noteText);
  } catch (error) {
    return asResultError("PERSISTENCE_ERROR", "Failed to save note draft.", {
      roomId: input.roomId,
      cause: error instanceof Error ? error.message : "unknown",
    });
  }

  const validationInput = {
    noteText: input.noteText,
    manualConfirmed: input.manualConfirmed,
    roomTopic: room.topic,
    ...(input.referenceTerms ? { referenceTerms: input.referenceTerms } : {}),
  };
  const validation = evaluateNoteValidation(validationInput);

  applyValidationToRoom(room, validation);
  room.updatedAt = input.nowIso;

  let artifact: ScribeSubmissionOutcome["artifact"];
  let completionChanged = false;
  let rewardEligible = false;

  if (!validation.finalPass) {
    if (!previouslyCleared) {
      room.state = "NotesDrafted";
      setDungeonRoomStatus(state.dungeon, room.roomId, "NotesDrafted");
    }
  } else {
    const shouldGenerateArtifact =
      mode === "revise"
        ? (input as ReviseClearedNoteInput).regenerateArtifact !== false
        : !previouslyCleared;

    if (shouldGenerateArtifact) {
      artifact = generateRoomArtifact({
        subjectName: state.dungeon.subjectName,
        roomId: room.roomId,
        roomTopic: room.topic,
        noteText: input.noteText,
        criterionScores: validation.criterionScores,
        qualityBonus: validation.qualityBonus,
        generatedAtIso: input.nowIso,
      });

      try {
        await persistence.saveRoomArtifact(room.roomId, artifact.markdown);
      } catch (error) {
        return asResultError("PERSISTENCE_ERROR", "Failed to persist generated artifact.", {
          roomId: room.roomId,
          cause: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    if (!previouslyCleared) {
      room.state = "EncounterDefeated";
      setDungeonRoomStatus(state.dungeon, room.roomId, "EncounterDefeated");
      completionChanged = true;
      rewardEligible = true;
    }
  }

  state.dungeon.phaseState = deriveScribePhaseState(state.rooms);
  state.dungeon.updatedAt = input.nowIso;

  try {
    await saveState(persistence, state.dungeon, room);
  } catch (error) {
    return asResultError("PERSISTENCE_ERROR", "Failed to persist scribe encounter state.", {
      roomId: room.roomId,
      cause: error instanceof Error ? error.message : "unknown",
    });
  }

  return {
    ok: true,
    value: {
      room: cloneRoom(room),
      dungeon: cloneDungeon(state.dungeon),
      validation,
      ...(artifact ? { artifact } : {}),
      completionChanged,
      rewardEligible,
      encounters: buildEncounterMap(state.rooms),
    },
  };
}

export function initializeScribeState(input: {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
}): ScribeResult<ScribeState> {
  return buildStateFromSnapshot(input);
}

export function createScribeOrchestrator(
  input: CreateScribeOrchestratorInput,
): ScribeOrchestrator {
  return {
    initialize(initialInput) {
      const initialized = buildStateFromSnapshot(initialInput.loadedSubject);
      if (!initialized.ok) {
        return initialized;
      }

      initialized.value.dungeon.updatedAt = initialInput.nowIso;
      return initialized;
    },

    async refresh() {
      try {
        const snapshot = await input.persistence.loadDungeon();
        return buildStateFromSnapshot(snapshot);
      } catch (error) {
        return asResultError("PERSISTENCE_ERROR", "Failed to refresh scribe state.", {
          cause: error instanceof Error ? error.message : "unknown",
        });
      }
    },

    async submitEncounterNote(submitInput) {
      return submitInternal(input.persistence, submitInput, "submit");
    },

    async reviseClearedNote(revisionInput) {
      return submitInternal(input.persistence, revisionInput, "revise");
    },
  };
}