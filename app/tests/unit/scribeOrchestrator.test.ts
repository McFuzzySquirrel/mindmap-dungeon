import { describe, expect, it, vi } from "vitest";

import type {
  DungeonMetadata,
  RoomMetadata,
  SubjectSnapshot,
  ValidationState,
} from "@core/validation/persistence";
import { createScribeOrchestrator, type ScribePersistencePort } from "@features/scribe";

const BASE_TIME = "2026-05-22T12:00:00.000Z";

function buildValidationState(): ValidationState {
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
    failedChecks: [
      "VAL_WORD_COUNT_TOO_LOW",
      "VAL_REQUIRED_SECTION_MISSING",
      "VAL_MANUAL_CONFIRM_REQUIRED",
    ],
    qualityBonus: 0,
    finalPass: false,
  };
}

function buildRoom(roomId: string, topic: string): RoomMetadata {
  return {
    roomId,
    topic,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    state: "Created",
    notePath: "notes.txt",
    artifactPath: "artifact.md",
    validationState: buildValidationState(),
    reviewPassCount: 0,
    attachments: [],
  };
}

function buildSnapshot(roomId = "room-root"): SubjectSnapshot {
  const room = buildRoom(roomId, "Systems Thinking");

  const dungeon: DungeonMetadata = {
    schemaVersion: "1.0.0",
    dungeonId: "dungeon-1",
    subjectName: "Study Systems",
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    phaseState: "ScribeActive",
    rootRoomId: roomId,
    rooms: [{ roomId, topic: room.topic, status: room.state }],
    edges: [],
    progression: {
      xpTotal: 0,
      rank: "Novice",
      badges: [],
    },
  };

  return {
    dungeon,
    rooms: { [roomId]: room },
  };
}

function buildValidNote(): string {
  return [
    "Summary",
    Array.from({ length: 45 }, (_, i) => `summary${i}`).join(" "),
    "",
    "Key Points",
    Array.from({ length: 45 }, (_, i) => `point${i}`).join(" "),
    "",
    "Recall Question",
    `How do ${Array.from({ length: 40 }, (_, i) => `concept${i}`).join(" ")} reinforce retrieval?`,
    "See also [[map-a]] and [[map-b]].",
  ].join("\n");
}

function buildInvalidNote(): string {
  return [
    "Summary",
    "Short draft.",
    "",
    "Key Points",
    "Missing enough detail.",
  ].join("\n");
}

function createMemoryPersistence(seed: SubjectSnapshot): {
  persistence: ScribePersistencePort;
  getSnapshot: () => SubjectSnapshot;
  readNote: (roomId: string) => string;
  artifactWrites: ReturnType<typeof vi.fn>;
} {
  let state = structuredClone(seed);
  const notesByRoomId = new Map<string, string>();
  const artifactsByRoomId = new Map<string, string>();

  const artifactWrites = vi.fn(async (roomId: string, markdown: string) => {
    artifactsByRoomId.set(roomId, markdown);
  });

  const persistence: ScribePersistencePort = {
    async loadDungeon() {
      return structuredClone(state);
    },
    async loadRoom(roomId) {
      const room = state.rooms[roomId];
      if (!room) {
        throw new Error(`Unknown room: ${roomId}`);
      }
      return structuredClone(room);
    },
    async saveDungeon(dungeon) {
      state = {
        ...state,
        dungeon: structuredClone(dungeon),
      };
    },
    async saveRoom(room) {
      state = {
        ...state,
        rooms: {
          ...state.rooms,
          [room.roomId]: structuredClone(room),
        },
      };
    },
    async saveRoomNote(roomId, noteText) {
      notesByRoomId.set(roomId, noteText);
      const room = state.rooms[roomId];
      if (!room) {
        throw new Error(`Unknown room: ${roomId}`);
      }
      const updatedRoom: RoomMetadata = {
        ...room,
        updatedAt: BASE_TIME,
      };
      state = {
        ...state,
        rooms: {
          ...state.rooms,
          [roomId]: updatedRoom,
        },
      };
      return structuredClone(updatedRoom);
    },
    async readRoomNote(roomId) {
      return notesByRoomId.get(roomId) ?? "";
    },
    async saveRoomArtifact(roomId, artifactMarkdown) {
      await artifactWrites(roomId, artifactMarkdown);
      const room = state.rooms[roomId];
      if (room) {
        state = {
          ...state,
          rooms: {
            ...state.rooms,
            [roomId]: {
              ...room,
              artifactPath: "artifact.md",
            },
          },
        };
      }
    },
  };

  return {
    persistence,
    getSnapshot: () => structuredClone(state),
    readNote: (roomId: string) => notesByRoomId.get(roomId) ?? "",
    artifactWrites,
  };
}

describe("scribe orchestration", () => {
  it("SCR-FR-02/SCR-FR-03 passes after correction and manual confirmation", async () => {
    const roomId = "room-root";
    const fixture = createMemoryPersistence(buildSnapshot(roomId));
    const orchestrator = createScribeOrchestrator({ persistence: fixture.persistence });

    const firstAttempt = await orchestrator.submitEncounterNote({
      roomId,
      noteText: buildInvalidNote(),
      manualConfirmed: false,
      nowIso: "2026-05-22T12:10:00.000Z",
    });

    expect(firstAttempt.ok).toBe(true);
    if (!firstAttempt.ok) {
      return;
    }
    expect(firstAttempt.value.validation.finalPass).toBe(false);

    const correctedAttempt = await orchestrator.submitEncounterNote({
      roomId,
      noteText: buildValidNote(),
      manualConfirmed: true,
      nowIso: "2026-05-22T12:20:00.000Z",
      referenceTerms: ["systems", "feedback"],
    });

    expect(correctedAttempt.ok).toBe(true);
    if (!correctedAttempt.ok) {
      return;
    }

    expect(correctedAttempt.value.validation.finalPass).toBe(true);
    expect(correctedAttempt.value.room.state).toBe("EncounterDefeated");
    expect(correctedAttempt.value.completionChanged).toBe(true);
    expect(correctedAttempt.value.rewardEligible).toBe(true);
    expect(correctedAttempt.value.artifact?.metadata.roomId).toBe(roomId);
  });

  it("SCR-FR-04 fail preserves draft and exposes unmet criteria", async () => {
    const roomId = "room-root";
    const fixture = createMemoryPersistence(buildSnapshot(roomId));
    const orchestrator = createScribeOrchestrator({ persistence: fixture.persistence });
    const invalidNote = buildInvalidNote();

    const outcome = await orchestrator.submitEncounterNote({
      roomId,
      noteText: invalidNote,
      manualConfirmed: false,
      nowIso: "2026-05-22T12:15:00.000Z",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }

    expect(outcome.value.validation.finalPass).toBe(false);
    expect(outcome.value.validation.failedChecks).toEqual(
      expect.arrayContaining([
        "VAL_WORD_COUNT_TOO_LOW",
        "VAL_REQUIRED_SECTION_MISSING",
        "VAL_MANUAL_CONFIRM_REQUIRED",
      ]),
    );
    expect(outcome.value.room.state).toBe("NotesDrafted");
    expect(fixture.readNote(roomId)).toBe(invalidNote);

    const snapshot = fixture.getSnapshot();
    expect(snapshot.rooms[roomId]?.state).toBe("NotesDrafted");
  });

  it("SCR-FR-07 generates artifact only once across repeated completion submissions", async () => {
    const roomId = "room-root";
    const fixture = createMemoryPersistence(buildSnapshot(roomId));
    const orchestrator = createScribeOrchestrator({ persistence: fixture.persistence });
    const validNote = buildValidNote();

    const first = await orchestrator.submitEncounterNote({
      roomId,
      noteText: validNote,
      manualConfirmed: true,
      nowIso: "2026-05-22T12:30:00.000Z",
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.validation.finalPass).toBe(true);
    expect(first.value.artifact).toBeDefined();

    const second = await orchestrator.submitEncounterNote({
      roomId,
      noteText: validNote,
      manualConfirmed: true,
      nowIso: "2026-05-22T12:31:00.000Z",
    });

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.value.validation.finalPass).toBe(true);
    expect(second.value.completionChanged).toBe(false);
    expect(second.value.rewardEligible).toBe(false);
    expect(second.value.artifact).toBeUndefined();
    expect(fixture.artifactWrites).toHaveBeenCalledTimes(1);
  });

  it("SCR-FR-05 post-completion note revision and resave succeeds", async () => {
    const roomId = "room-root";
    const fixture = createMemoryPersistence(buildSnapshot(roomId));
    const orchestrator = createScribeOrchestrator({ persistence: fixture.persistence });

    const clearResult = await orchestrator.submitEncounterNote({
      roomId,
      noteText: buildValidNote(),
      manualConfirmed: true,
      nowIso: "2026-05-22T12:40:00.000Z",
    });

    expect(clearResult.ok).toBe(true);
    if (!clearResult.ok) {
      return;
    }

    const revisedNote = `${buildValidNote()}\n\nAdditional retained insight after completion.`;
    const reviseResult = await orchestrator.reviseClearedNote({
      roomId,
      noteText: revisedNote,
      manualConfirmed: true,
      nowIso: "2026-05-22T12:45:00.000Z",
      regenerateArtifact: false,
    });

    expect(reviseResult.ok).toBe(true);
    if (!reviseResult.ok) {
      return;
    }

    expect(reviseResult.value.validation.finalPass).toBe(true);
    expect(reviseResult.value.room.state).toBe("EncounterDefeated");
    expect(reviseResult.value.completionChanged).toBe(false);
    expect(reviseResult.value.rewardEligible).toBe(false);
    expect(fixture.readNote(roomId)).toBe(revisedNote);
  });
});
