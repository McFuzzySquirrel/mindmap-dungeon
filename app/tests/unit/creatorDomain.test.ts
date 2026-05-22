import { describe, expect, it } from "vitest";

import {
  addCrossLink,
  addLinkedRooms,
  createRootDungeon,
  deriveTraversalSnapshot,
} from "@core/graph";
import {
  addLinkedRoomsToCreatorState,
  getDeterministicTopicSuggestions,
  initializeCreatorState,
} from "@features/creator";
import type {
  DungeonMetadata,
  RoomMetadata,
  RoomState,
  ValidationState,
} from "@core/validation/persistence";

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

function buildRoomMetadata(roomId: string, topic: string, state: RoomState): RoomMetadata {
  const nowIso = "2026-05-22T00:00:00.000Z";

  return {
    roomId,
    topic,
    createdAt: nowIso,
    updatedAt: nowIso,
    state,
    notePath: "note.md",
    artifactPath: "artifact.md",
    validationState: buildValidationState(),
    reviewPassCount: 0,
    attachments: [],
  };
}

function buildLoadedSubject(dungeon: DungeonMetadata) {
  const rooms: Record<string, RoomMetadata> = {};
  for (const room of dungeon.rooms) {
    rooms[room.roomId] = buildRoomMetadata(room.roomId, room.topic, room.status);
  }

  return {
    dungeon,
    rooms,
  };
}

describe("creator domain", () => {
  it("CRT-FR-01/02 creates root room and linked rooms from drafts", () => {
    const rootResult = createRootDungeon({
      dungeonId: "dungeon-1",
      subjectName: "Biology 101",
      rootRoomId: "room-root",
      rootTopic: "Cells",
      nowIso: "2026-05-22T10:00:00.000Z",
    });

    expect(rootResult.ok).toBe(true);
    if (!rootResult.ok) {
      return;
    }

    const linkedResult = addLinkedRooms(rootResult.value, {
      fromRoomId: "room-root",
      drafts: [
        { roomId: "room-a", topic: "Mitosis" },
        { roomId: "room-b", topic: "Cell Organelles", relationType: "related" },
      ],
      nowIso: "2026-05-22T10:05:00.000Z",
    });

    expect(linkedResult.ok).toBe(true);
    if (!linkedResult.ok) {
      return;
    }

    expect(linkedResult.value.createdRoomIds).toEqual(["room-a", "room-b"]);
    expect(linkedResult.value.dungeon.rooms.map((room) => room.roomId)).toEqual([
      "room-root",
      "room-a",
      "room-b",
    ]);
    expect(linkedResult.value.dungeon.edges).toEqual([
      {
        fromRoomId: "room-root",
        toRoomId: "room-a",
        relationType: "subtopic",
        createdAt: "2026-05-22T10:05:00.000Z",
        createdByPhase: "Creator",
      },
      {
        fromRoomId: "room-root",
        toRoomId: "room-b",
        relationType: "related",
        createdAt: "2026-05-22T10:05:00.000Z",
        createdByPhase: "Creator",
      },
    ]);
  });

  it("CRT-FR-04 prevents duplicate topic identity case-insensitively", () => {
    const root = createRootDungeon({
      dungeonId: "dungeon-2",
      subjectName: "Chemistry 101",
      rootRoomId: "room-root",
      rootTopic: "Atoms",
      nowIso: "2026-05-22T10:00:00.000Z",
    });

    if (!root.ok) {
      throw new Error("Expected root creation to succeed");
    }

    const duplicateTopicResult = addLinkedRooms(root.value, {
      fromRoomId: "room-root",
      drafts: [{ roomId: "room-dup", topic: "  atoms  " }],
      nowIso: "2026-05-22T10:05:00.000Z",
    });

    expect(duplicateTopicResult.ok).toBe(false);
    if (!duplicateTopicResult.ok) {
      expect(duplicateTopicResult.error.code).toBe("TOPIC_ALREADY_EXISTS");
    }
  });

  it("CRT-FR-03 maintains cross-link integrity and rejects duplicate links", () => {
    const root = createRootDungeon({
      dungeonId: "dungeon-3",
      subjectName: "Physics 101",
      rootRoomId: "room-root",
      rootTopic: "Motion",
      nowIso: "2026-05-22T10:00:00.000Z",
    });

    if (!root.ok) {
      throw new Error("Expected root creation to succeed");
    }

    const expanded = addLinkedRooms(root.value, {
      fromRoomId: "room-root",
      drafts: [
        { roomId: "room-a", topic: "Velocity" },
        { roomId: "room-b", topic: "Acceleration" },
      ],
      nowIso: "2026-05-22T10:05:00.000Z",
    });

    if (!expanded.ok) {
      throw new Error("Expected linked room creation to succeed");
    }

    const firstCrossLink = addCrossLink(expanded.value.dungeon, {
      fromRoomId: "room-a",
      toRoomId: "room-b",
      relationType: "related",
      nowIso: "2026-05-22T10:10:00.000Z",
    });

    expect(firstCrossLink.ok).toBe(true);
    if (!firstCrossLink.ok) {
      return;
    }

    expect(
      firstCrossLink.value.dungeon.edges.some(
        (edge) =>
          edge.fromRoomId === "room-a" &&
          edge.toRoomId === "room-b" &&
          edge.relationType === "related",
      ),
    ).toBe(true);

    const duplicateCrossLink = addCrossLink(firstCrossLink.value.dungeon, {
      fromRoomId: "room-a",
      toRoomId: "room-b",
      relationType: "related",
      nowIso: "2026-05-22T10:11:00.000Z",
    });

    expect(duplicateCrossLink.ok).toBe(false);
    if (!duplicateCrossLink.ok) {
      expect(duplicateCrossLink.error.code).toBe("EDGE_ALREADY_EXISTS");
    }
  });

  it("CRT-FR-05 derives unresolved and visited room sets deterministically", () => {
    const dungeon: DungeonMetadata = {
      schemaVersion: "1.0.0",
      dungeonId: "dungeon-4",
      subjectName: "History 101",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
      phaseState: "CreatorActive",
      rootRoomId: "room-root",
      rooms: [
        { roomId: "room-root", topic: "Ancient Rome", status: "Visited" },
        { roomId: "room-a", topic: "Republic", status: "Created" },
        { roomId: "room-b", topic: "Empire", status: "Created" },
        { roomId: "room-c", topic: "Fall", status: "NeedsRevalidation" },
      ],
      edges: [
        {
          fromRoomId: "room-root",
          toRoomId: "room-a",
          relationType: "subtopic",
          createdAt: "2026-05-22T00:00:00.000Z",
          createdByPhase: "Creator",
        },
      ],
      progression: {
        xpTotal: 0,
        rank: "Novice",
        badges: [],
      },
    };

    const snapshot = deriveTraversalSnapshot(dungeon);

    expect(snapshot.visitedRoomIds).toEqual(["room-root", "room-c"]);
    expect(snapshot.unresolvedRoomIds).toEqual(["room-b", "room-a"]);
    expect(snapshot.revalidationNeededRoomIds).toEqual(["room-c"]);
    expect(snapshot.unvisitedRoomIds).toEqual(["room-b", "room-a"]);
  });

  it("CRT-FR-07 marks impacted rooms as NeedsRevalidation after post-Scribe graph edits", () => {
    const dungeon: DungeonMetadata = {
      schemaVersion: "1.0.0",
      dungeonId: "dungeon-5",
      subjectName: "Algebra",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
      phaseState: "ScribeActive",
      rootRoomId: "room-root",
      rooms: [
        { roomId: "room-root", topic: "Functions", status: "NotesDrafted" },
        { roomId: "room-a", topic: "Linear", status: "EncounterDefeated" },
      ],
      edges: [
        {
          fromRoomId: "room-root",
          toRoomId: "room-a",
          relationType: "subtopic",
          createdAt: "2026-05-22T00:00:00.000Z",
          createdByPhase: "Creator",
        },
      ],
      progression: {
        xpTotal: 10,
        rank: "Novice",
        badges: [],
      },
    };

    const initialized = initializeCreatorState({
      loadedSubject: buildLoadedSubject(dungeon),
    });

    if (!initialized.ok) {
      throw new Error("Expected creator state initialization to succeed");
    }

    const result = addLinkedRoomsToCreatorState(initialized.value, {
      fromRoomId: "room-root",
      drafts: [{ roomId: "room-b", topic: "Quadratic" }],
      nowIso: "2026-05-22T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const roomStatusById = Object.fromEntries(
      result.value.state.dungeon.rooms.map((room) => [room.roomId, room.status]),
    );

    expect(roomStatusById).toMatchObject({
      "room-root": "NeedsRevalidation",
      "room-a": "NeedsRevalidation",
      "room-b": "Created",
    });
    expect(result.value.summary.revalidationRevokedRoomIds).toEqual([
      "room-a",
      "room-root",
    ]);
  });

  it("CRT-FR-06 returns deterministic suggestions without mutating graph state", () => {
    const root = createRootDungeon({
      dungeonId: "dungeon-6",
      subjectName: "Geography",
      rootRoomId: "room-root",
      rootTopic: "Climate",
      nowIso: "2026-05-22T10:00:00.000Z",
    });

    if (!root.ok) {
      throw new Error("Expected root creation to succeed");
    }

    const initialized = initializeCreatorState({
      loadedSubject: buildLoadedSubject(root.value),
    });

    if (!initialized.ok) {
      throw new Error("Expected creator state initialization to succeed");
    }

    const beforeRooms = initialized.value.dungeon.rooms.length;
    const beforeEdges = initialized.value.dungeon.edges.length;

    const first = getDeterministicTopicSuggestions(initialized.value, "room-root", 3);
    const second = getDeterministicTopicSuggestions(initialized.value, "room-root", 3);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.value.suggestions).toEqual(second.value.suggestions);
    expect(initialized.value.dungeon.rooms).toHaveLength(beforeRooms);
    expect(initialized.value.dungeon.edges).toHaveLength(beforeEdges);
  });
});
