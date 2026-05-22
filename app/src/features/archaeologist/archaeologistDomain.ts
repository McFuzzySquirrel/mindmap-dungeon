import {
  buildArtifactPresentationContract,
  buildReviewRoomReviewedEvent,
  buildReviewTraversal,
  evaluateReviewUnlock,
  extractMarkdownHeadings,
  generateSelfCheckPrompts,
  summarizeReviewAnalytics,
} from "@core/review";
import type {
  DungeonMetadata,
  RoomMetadata,
} from "@core/validation/persistence";

import type {
  ArchaeologistDomainError,
  ArchaeologistOrchestrator,
  ArchaeologistResult,
  ArchaeologistSessionState,
  ArchaeologistState,
  CreateArchaeologistOrchestratorInput,
} from "./types";

function asError(
  code: ArchaeologistDomainError["code"],
  message: string,
  details?: Record<string, unknown>,
): ArchaeologistDomainError {
  return {
    code,
    message,
    ...(details ? { details } : {}),
  };
}

function asResultError<T>(
  code: ArchaeologistDomainError["code"],
  message: string,
  details?: Record<string, unknown>,
): ArchaeologistResult<T> {
  return {
    ok: false,
    error: asError(code, message, details),
  };
}

function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
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

function defaultSession(nowIso: string): ArchaeologistSessionState {
  return {
    startedAt: nowIso,
    reviewedRoomIds: [],
    currentStreak: 0,
    longestStreak: 0,
    eventSequence: 0,
  };
}

function updateDungeonRoomStatus(
  dungeon: DungeonMetadata,
  roomId: string,
  status: RoomMetadata["state"],
): void {
  const summary = dungeon.rooms.find((entry) => entry.roomId === roomId);
  if (summary) {
    summary.status = status;
  }
}

function deriveRelatedTopics(input: {
  dungeon: DungeonMetadata;
  roomId: string;
}): string[] {
  const neighborRoomIds = new Set<string>();

  for (const edge of input.dungeon.edges) {
    if (edge.fromRoomId === input.roomId) {
      neighborRoomIds.add(edge.toRoomId);
    } else if (edge.toRoomId === input.roomId) {
      neighborRoomIds.add(edge.fromRoomId);
    }
  }

  return input.dungeon.rooms
    .filter((room) => neighborRoomIds.has(room.roomId))
    .map((room) => room.topic)
    .sort((left, right) => left.localeCompare(right));
}

function nextStreakState(input: {
  session: ArchaeologistSessionState;
  orderedRoomIds: readonly string[];
  roomId: string;
}): Pick<ArchaeologistSessionState, "currentStreak" | "longestStreak"> {
  const previousRoomId = input.session.reviewedRoomIds[input.session.reviewedRoomIds.length - 1];
  if (!previousRoomId) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(input.session.longestStreak, 1),
    };
  }

  const previousIndex = input.orderedRoomIds.indexOf(previousRoomId);
  const currentIndex = input.orderedRoomIds.indexOf(input.roomId);

  const isConsecutive = previousIndex >= 0 && currentIndex === previousIndex + 1;
  const currentStreak = isConsecutive ? input.session.currentStreak + 1 : 1;

  return {
    currentStreak,
    longestStreak: Math.max(input.session.longestStreak, currentStreak),
  };
}

function buildState(input: {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
  requiredCompletionRatio: number;
  session?: ArchaeologistSessionState;
}): ArchaeologistState {
  const unlock = evaluateReviewUnlock({
    dungeon: input.dungeon,
    rooms: input.rooms,
    requiredCompletionRatio: input.requiredCompletionRatio,
  });
  const traversal = buildReviewTraversal({
    dungeon: input.dungeon,
    rooms: input.rooms,
  });
  const analytics = summarizeReviewAnalytics({
    rooms: input.rooms,
    reviewableRoomIds: traversal.orderedRoomIds,
    currentReviewStreak: input.session?.currentStreak ?? 0,
    longestReviewStreak: input.session?.longestStreak ?? 0,
  });

  return {
    dungeon: cloneDungeon(input.dungeon),
    rooms: cloneRooms(input.rooms),
    unlock,
    traversal,
    analytics,
    ...(input.session ? { session: { ...input.session, reviewedRoomIds: [...input.session.reviewedRoomIds] } } : {}),
  };
}

export function createArchaeologistOrchestrator(
  input: CreateArchaeologistOrchestratorInput,
): ArchaeologistOrchestrator {
  const requiredCompletionRatio = input.requiredCompletionRatio ?? 1;
  let state: ArchaeologistState | null = null;

  async function refreshInternal(nowIso: string): Promise<ArchaeologistResult<ArchaeologistState>> {
    let snapshot;
    try {
      snapshot = await input.persistence.loadDungeon();
    } catch (error) {
      return asResultError("PERSISTENCE_ERROR", "Failed to load subject snapshot.", {
        cause: error instanceof Error ? error.message : "unknown",
      });
    }

    const nextState = buildState({
      dungeon: snapshot.dungeon,
      rooms: snapshot.rooms,
      requiredCompletionRatio,
      ...(state?.session ? { session: state.session } : {}),
    });

    if (nextState.unlock.unlocked && nextState.dungeon.phaseState === "ScribeComplete") {
      nextState.dungeon.phaseState = "ArchaeologistUnlocked";
      nextState.dungeon.updatedAt = nowIso;
      try {
        await input.persistence.saveDungeon(nextState.dungeon);
      } catch (error) {
        return asResultError("PERSISTENCE_ERROR", "Failed to persist unlock state.", {
          cause: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    state = nextState;
    return {
      ok: true,
      value: buildState({
        dungeon: nextState.dungeon,
        rooms: nextState.rooms,
        requiredCompletionRatio,
        ...(nextState.session ? { session: nextState.session } : {}),
      }),
    };
  }

  async function ensureSession(nowIso: string): Promise<ArchaeologistResult<ArchaeologistState>> {
    const refreshed = await refreshInternal(nowIso);
    if (!refreshed.ok) {
      return refreshed;
    }

    const current = refreshed.value;
    if (!current.unlock.unlocked) {
      return asResultError(
        "REVIEW_LOCKED",
        "Review mode is locked until the scribe completion threshold is met.",
        {
          completionRatio: current.unlock.completionRatio,
          requiredCompletionRatio: current.unlock.requiredCompletionRatio,
        },
      );
    }

    if (current.session) {
      return {
        ok: true,
        value: current,
      };
    }

    const startedSession = defaultSession(nowIso);
    current.session = startedSession;
    current.analytics = summarizeReviewAnalytics({
      rooms: current.rooms,
      reviewableRoomIds: current.traversal.orderedRoomIds,
      currentReviewStreak: startedSession.currentStreak,
      longestReviewStreak: startedSession.longestStreak,
    });

    if (current.dungeon.phaseState === "ArchaeologistUnlocked") {
      current.dungeon.phaseState = "ArchaeologistActive";
      current.dungeon.updatedAt = nowIso;
      try {
        await input.persistence.saveDungeon(current.dungeon);
      } catch (error) {
        return asResultError("PERSISTENCE_ERROR", "Failed to persist active review phase state.", {
          cause: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    state = current;
    return {
      ok: true,
      value: buildState({
        dungeon: current.dungeon,
        rooms: current.rooms,
        requiredCompletionRatio,
        ...(current.session ? { session: current.session } : {}),
      }),
    };
  }

  return {
    async initialize(initialInput) {
      if (initialInput.loadedSubject) {
        const session = state?.session;
        state = buildState({
          dungeon: initialInput.loadedSubject.dungeon,
          rooms: initialInput.loadedSubject.rooms,
          requiredCompletionRatio: initialInput.requiredCompletionRatio ?? requiredCompletionRatio,
          ...(session ? { session } : {}),
        });

        return {
          ok: true,
          value: state,
        };
      }

      return refreshInternal(initialInput.nowIso);
    },

    async refresh(nowIso) {
      return refreshInternal(nowIso);
    },

    async startSession(nowIso) {
      return ensureSession(nowIso);
    },

    async reviewRoom(reviewInput) {
      const sessionReady = await ensureSession(reviewInput.nowIso);
      if (!sessionReady.ok) {
        return sessionReady;
      }

      const current = sessionReady.value;
      const activeSession = current.session;
      if (!activeSession) {
        return asResultError(
          "INVALID_OPERATION",
          "Review session state is unavailable after initialization.",
        );
      }

      const room = current.rooms[reviewInput.roomId];
      if (!room) {
        return asResultError("ROOM_NOT_FOUND", "Review room was not found.", {
          roomId: reviewInput.roomId,
        });
      }

      if (!current.traversal.roomsById[reviewInput.roomId]) {
        return asResultError(
          "ROOM_NOT_REVIEWABLE",
          "Review is only available for completed rooms with cleared encounters.",
          { roomId: reviewInput.roomId },
        );
      }

      let artifactMarkdown: string;
      try {
        artifactMarkdown = await input.persistence.readRoomArtifact(reviewInput.roomId);
      } catch (error) {
        return asResultError(
          "ARTIFACT_NOT_FOUND",
          "Artifact markdown is not available for this room.",
          {
            roomId: reviewInput.roomId,
            cause: error instanceof Error ? error.message : "unknown",
          },
        );
      }

      const artifact = buildArtifactPresentationContract({
        roomId: room.roomId,
        markdown: artifactMarkdown,
        attachments: room.attachments,
      });

      const prompts = generateSelfCheckPrompts({
        roomId: room.roomId,
        subjectName: current.dungeon.subjectName,
        roomTopic: room.topic,
        noteHeadings: extractMarkdownHeadings(artifactMarkdown),
        relatedTopics: deriveRelatedTopics({
          dungeon: current.dungeon,
          roomId: room.roomId,
        }),
        ...(reviewInput.maxPromptCount === undefined
          ? {}
          : { maxPromptCount: reviewInput.maxPromptCount }),
      });

      const streak = nextStreakState({
        session: activeSession,
        orderedRoomIds: current.traversal.orderedRoomIds,
        roomId: room.roomId,
      });

      room.reviewPassCount = toNonNegativeInteger(room.reviewPassCount) + 1;
      room.updatedAt = reviewInput.nowIso;
      room.state = "ArtifactCollected";
      updateDungeonRoomStatus(current.dungeon, room.roomId, room.state);

      current.session = {
        startedAt: activeSession.startedAt,
        reviewedRoomIds: [...activeSession.reviewedRoomIds, room.roomId],
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        eventSequence: activeSession.eventSequence + 1,
      };

      current.analytics = summarizeReviewAnalytics({
        rooms: current.rooms,
        reviewableRoomIds: current.traversal.orderedRoomIds,
        currentReviewStreak: current.session.currentStreak,
        longestReviewStreak: current.session.longestStreak,
      });

      current.dungeon.updatedAt = reviewInput.nowIso;
      if (current.dungeon.phaseState === "ArchaeologistUnlocked") {
        current.dungeon.phaseState = "ArchaeologistActive";
      }

      try {
        await input.persistence.saveRoom(room);
        await input.persistence.saveDungeon(current.dungeon);
      } catch (error) {
        return asResultError("PERSISTENCE_ERROR", "Failed to persist reviewed-room state.", {
          roomId: room.roomId,
          cause: error instanceof Error ? error.message : "unknown",
        });
      }

      const event = buildReviewRoomReviewedEvent({
        subjectId: current.dungeon.dungeonId,
        dungeonId: current.dungeon.dungeonId,
        roomId: room.roomId,
        occurredAt: reviewInput.nowIso,
        sequence: current.session.eventSequence,
        analytics: current.analytics,
      });

      state = buildState({
        dungeon: current.dungeon,
        rooms: current.rooms,
        requiredCompletionRatio,
        ...(current.session ? { session: current.session } : {}),
      });

      return {
        ok: true,
        value: {
          state,
          room: cloneRoom(room),
          artifact,
          prompts,
          event,
        },
      };
    },
  };
}
