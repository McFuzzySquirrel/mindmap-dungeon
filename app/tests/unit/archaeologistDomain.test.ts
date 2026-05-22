import { describe, expect, it } from "vitest";

import type {
  DungeonMetadata,
  RoomMetadata,
  SubjectSnapshot,
  ValidationState,
} from "@core/validation/persistence";
import {
  createArchaeologistOrchestrator,
  type ArchaeologistPersistencePort,
} from "@features/archaeologist";

const BASE_TIME = "2026-05-22T16:00:00.000Z";

function buildValidationState(finalPass: boolean): ValidationState {
  return {
    wordCount: finalPass ? 160 : 15,
    requiredSectionsPresent: finalPass,
    manualConfirmed: finalPass,
    criterionScores: {
      sectionCompleteness: finalPass ? 2 : 0,
      conceptTermCoverage: finalPass ? 2 : 0,
      linkReferences: finalPass ? 2 : 0,
      recallQuestionQuality: finalPass ? 2 : 0,
      clarityReadability: finalPass ? 2 : 0,
    },
    failedChecks: finalPass ? [] : ["VAL_WORD_COUNT_TOO_LOW"],
    qualityBonus: finalPass ? 9 : 0,
    finalPass,
  };
}

function buildRoom(input: {
  roomId: string;
  topic: string;
  state: RoomMetadata["state"];
  finalPass: boolean;
  reviewPassCount?: number;
}): RoomMetadata {
  return {
    roomId: input.roomId,
    topic: input.topic,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    state: input.state,
    notePath: "notes.txt",
    artifactPath: "artifact.md",
    validationState: buildValidationState(input.finalPass),
    reviewPassCount: input.reviewPassCount ?? 0,
    attachments: [
      {
        attachmentId: `${input.roomId}-img`,
        fileName: "diagram.png",
        mimeType: "image/png",
        relativePath: "attachments/diagram.png",
        addedAt: BASE_TIME,
      },
    ],
  };
}

function buildSnapshot(input: {
  phaseState?: DungeonMetadata["phaseState"];
  rooms: RoomMetadata[];
}): SubjectSnapshot {
  return {
    dungeon: {
      schemaVersion: "1.0.0",
      dungeonId: "subject-arc-1",
      subjectName: "Calculus",
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      phaseState: input.phaseState ?? "ScribeComplete",
      rootRoomId: input.rooms[0]?.roomId ?? "room-1",
      rooms: input.rooms.map((room) => ({
        roomId: room.roomId,
        topic: room.topic,
        status: room.state,
      })),
      edges: [
        {
          fromRoomId: "room-1",
          toRoomId: "room-2",
          relationType: "related",
          createdAt: BASE_TIME,
          createdByPhase: "Creator",
        },
      ],
      progression: {
        xpTotal: 0,
        rank: "Novice",
        badges: [],
      },
    },
    rooms: Object.fromEntries(input.rooms.map((room) => [room.roomId, room])),
  };
}

function createMemoryPersistence(seed: SubjectSnapshot): {
  persistence: ArchaeologistPersistencePort;
  getSnapshot: () => SubjectSnapshot;
} {
  let snapshot = structuredClone(seed);
  const artifacts = new Map<string, string>(
    Object.keys(seed.rooms).map((roomId) => [
      roomId,
      [
        "# Scribe Artifact",
        "## Summary",
        "## Key Points",
        "See [diagram](attachments/diagram.png).",
      ].join("\n"),
    ]),
  );

  const persistence: ArchaeologistPersistencePort = {
    async loadDungeon() {
      return structuredClone(snapshot);
    },
    async loadRoom(roomId) {
      const room = snapshot.rooms[roomId];
      if (!room) {
        throw new Error(`Unknown room: ${roomId}`);
      }
      return structuredClone(room);
    },
    async saveDungeon(dungeon) {
      snapshot = {
        ...snapshot,
        dungeon: structuredClone(dungeon),
      };
    },
    async saveRoom(room) {
      snapshot = {
        ...snapshot,
        rooms: {
          ...snapshot.rooms,
          [room.roomId]: structuredClone(room),
        },
      };
    },
    async readRoomArtifact(roomId) {
      const markdown = artifacts.get(roomId);
      if (!markdown) {
        throw new Error("artifact missing");
      }
      return markdown;
    },
  };

  return {
    persistence,
    getSnapshot: () => structuredClone(snapshot),
  };
}

describe("archaeologist orchestrator", () => {
  it("ARC-FR-01 keeps review locked below completion threshold", async () => {
    const roomOne = buildRoom({
      roomId: "room-1",
      topic: "Limits",
      state: "EncounterDefeated",
      finalPass: true,
    });
    const roomTwo = buildRoom({
      roomId: "room-2",
      topic: "Derivatives",
      state: "NotesDrafted",
      finalPass: false,
    });

    const fixture = createMemoryPersistence(buildSnapshot({ rooms: [roomOne, roomTwo] }));
    const orchestrator = createArchaeologistOrchestrator({
      persistence: fixture.persistence,
      requiredCompletionRatio: 1,
    });

    const start = await orchestrator.startSession("2026-05-22T16:10:00.000Z");

    expect(start.ok).toBe(false);
    if (start.ok) {
      return;
    }

    expect(start.error.code).toBe("REVIEW_LOCKED");
  });

  it("ARC-FR-02/03/04/05 reviews completed rooms, emits events, and increments streak", async () => {
    const roomOne = buildRoom({
      roomId: "room-1",
      topic: "Limits",
      state: "EncounterDefeated",
      finalPass: true,
    });
    const roomTwo = buildRoom({
      roomId: "room-2",
      topic: "Derivatives",
      state: "EncounterDefeated",
      finalPass: true,
    });

    const fixture = createMemoryPersistence(buildSnapshot({ rooms: [roomOne, roomTwo] }));
    const orchestrator = createArchaeologistOrchestrator({
      persistence: fixture.persistence,
      requiredCompletionRatio: 1,
    });

    const firstReview = await orchestrator.reviewRoom({
      roomId: "room-1",
      nowIso: "2026-05-22T16:20:00.000Z",
      maxPromptCount: 3,
    });

    expect(firstReview.ok).toBe(true);
    if (!firstReview.ok) {
      return;
    }

    expect(firstReview.value.room.reviewPassCount).toBe(1);
    expect(firstReview.value.artifact.attachments[0]?.isLinkedInMarkdown).toBe(true);
    expect(firstReview.value.prompts).toHaveLength(3);
    expect(firstReview.value.event.currentReviewStreak).toBe(1);

    const secondReview = await orchestrator.reviewRoom({
      roomId: "room-2",
      nowIso: "2026-05-22T16:25:00.000Z",
    });

    expect(secondReview.ok).toBe(true);
    if (!secondReview.ok) {
      return;
    }

    expect(secondReview.value.event.reviewSessionCount).toBe(2);
    expect(secondReview.value.event.currentReviewStreak).toBe(2);
    expect(secondReview.value.event.fullReviewPasses).toBe(1);

    const persisted = fixture.getSnapshot();
    expect(persisted.rooms["room-1"]?.reviewPassCount).toBe(1);
    expect(persisted.rooms["room-2"]?.reviewPassCount).toBe(1);
    expect(persisted.dungeon.phaseState).toBe("ArchaeologistActive");
  });
});
