import { describe, expect, it } from "vitest";

import {
  isPersistenceError,
  type PersistenceErrorCode,
} from "@core/error-catalog";
import {
  validateDungeonMetadata,
  validateRoomMetadata,
  type DungeonMetadata,
  type RoomMetadata,
} from "@core/validation/persistence";
import { migrateDungeonIfNeeded } from "@services/fileStore";

function expectPersistenceCode(error: unknown, expectedCode: PersistenceErrorCode): void {
  expect(isPersistenceError(error)).toBe(true);
  if (!isPersistenceError(error)) {
    return;
  }

  expect(error.code).toBe(expectedCode);
}

function buildValidRoom(): RoomMetadata {
  const now = new Date("2026-05-22T10:00:00.000Z").toISOString();
  return {
    roomId: "01JW06730Y5XZ5SR6QCE3SMJ8N",
    topic: "Valid Topic",
    createdAt: now,
    updatedAt: now,
    state: "Created",
    notePath: "notes.txt",
    artifactPath: "artifact.md",
    validationState: {
      wordCount: 130,
      requiredSectionsPresent: true,
      manualConfirmed: true,
      criterionScores: {
        sectionCompleteness: 2,
        conceptTermCoverage: 2,
        linkReferences: 2,
        recallQuestionQuality: 2,
        clarityReadability: 2,
      },
      failedChecks: [],
      qualityBonus: 10,
      finalPass: true,
    },
    reviewPassCount: 0,
    attachments: [],
  };
}

function buildValidDungeon(): DungeonMetadata {
  const now = new Date("2026-05-22T10:00:00.000Z").toISOString();
  return {
    schemaVersion: "1.0.0",
    dungeonId: "01JW06747G69G2DGZ0P9FKQ8XD",
    subjectName: "Valid Subject",
    createdAt: now,
    updatedAt: now,
    phaseState: "CreatorActive",
    rootRoomId: "01JW06730Y5XZ5SR6QCE3SMJ8N",
    rooms: [
      {
        roomId: "01JW06730Y5XZ5SR6QCE3SMJ8N",
        topic: "Root",
        status: "Created",
      },
    ],
    edges: [],
    progression: {
      xpTotal: 0,
      rank: "Novice",
      badges: [],
    },
  };
}

describe("persistence error codes", () => {
  it("FND-FR-05 emits VAL_ENUM_INVALID for invalid room enum", () => {
    const room = buildValidRoom();
    const invalid = {
      ...room,
      state: "InvalidState",
    } as unknown as RoomMetadata;

    try {
      validateRoomMetadata(invalid);
      throw new Error("expected validateRoomMetadata to throw");
    } catch (error) {
      expectPersistenceCode(error, "VAL_ENUM_INVALID");
    }
  });

  it("FND-FR-04 emits VAL_ROOT_ROOM_INVALID for broken dungeon root linkage", () => {
    const dungeon = {
      ...buildValidDungeon(),
      rootRoomId: "01JW0678P5R3G8QH1KCKQY0TGQ",
    };

    try {
      validateDungeonMetadata(dungeon);
      throw new Error("expected validateDungeonMetadata to throw");
    } catch (error) {
      expectPersistenceCode(error, "VAL_ROOT_ROOM_INVALID");
    }
  });

  it("FND-FR-04 emits VAL_EDGE_ORPHAN when an edge references unknown room", () => {
    const dungeon = buildValidDungeon();
    dungeon.edges.push({
      fromRoomId: dungeon.rootRoomId,
      toRoomId: "01JW0678P5R3G8QH1KCKQY0TGQ",
      relationType: "related",
      createdAt: dungeon.createdAt,
      createdByPhase: "Creator",
    });

    try {
      validateDungeonMetadata(dungeon);
      throw new Error("expected validateDungeonMetadata to throw");
    } catch (error) {
      expectPersistenceCode(error, "VAL_EDGE_ORPHAN");
    }
  });

  it("FND-FR-05 emits SCHEMA_VERSION_MISSING for malformed migration schemaVersion", async () => {
    const dungeon = {
      ...buildValidDungeon(),
      schemaVersion: "invalid",
    };

    try {
      await migrateDungeonIfNeeded(
        { workspaceRoot: "/tmp/not-used", subjectId: "tmp" },
        dungeon,
      );
      throw new Error("expected migrateDungeonIfNeeded to throw");
    } catch (error) {
      expectPersistenceCode(error, "SCHEMA_VERSION_MISSING");
    }
  });

  it("FND-FR-05 emits MIGRATION_REQUIRED when incoming schema is newer than app", async () => {
    const dungeon = {
      ...buildValidDungeon(),
      schemaVersion: "9.0.0",
    };

    try {
      await migrateDungeonIfNeeded(
        { workspaceRoot: "/tmp/not-used", subjectId: "tmp" },
        dungeon,
      );
      throw new Error("expected migrateDungeonIfNeeded to throw");
    } catch (error) {
      expectPersistenceCode(error, "MIGRATION_REQUIRED");
    }
  });

  it("FND-FR-05 emits SCHEMA_FIELD_INVALID for invalid room identifiers", () => {
    const room = {
      ...buildValidRoom(),
      roomId: "not-a-ulid",
    };

    try {
      validateRoomMetadata(room);
      throw new Error("expected validateRoomMetadata to throw");
    } catch (error) {
      expectPersistenceCode(error, "SCHEMA_FIELD_INVALID");
    }
  });
});
