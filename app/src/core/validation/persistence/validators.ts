import {
  PERSISTENCE_ERROR_CODES,
  type PersistenceErrorCode,
  toPersistenceError,
} from "@core/error-catalog";

import {
  CURRENT_SCHEMA_VERSION,
  EDGE_PHASES,
  EDGE_RELATION_TYPES,
  PHASE_STATES,
  QUALITY_SCORE_KEYS,
  ROOM_STATES,
  type CriterionScores,
  type DungeonMetadata,
  type RoomMetadata,
  type ValidationState,
} from "./types";
import { isUlid } from "./ulid";

const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function assert(condition: boolean, message: string, details?: unknown): void {
  if (!condition) {
    throw toPersistenceError("SCHEMA_FIELD_INVALID", message, details);
  }
}

function assertEnumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  fieldName: string,
): void {
  if (!allowed.includes(value as T)) {
    throw toPersistenceError("VAL_ENUM_INVALID", `${fieldName} contains unsupported enum value.`, {
      fieldName,
      value,
      allowed,
    });
  }
}

export function assertSemver(value: string, fieldName = "schemaVersion"): void {
  if (!SEMVER_REGEX.test(value)) {
    throw toPersistenceError(
      "SCHEMA_VERSION_MISSING",
      `${fieldName} must be a valid semver string.`,
      { fieldName, value },
    );
  }
}

function assertIsoDate(value: string, fieldName: string): void {
  assert(ISO_DATE_REGEX.test(value), `${fieldName} must be an ISO timestamp.`, {
    fieldName,
    value,
  });
}

function assertQualityScores(scores: CriterionScores): number {
  const keys = Object.keys(scores);
  assert(
    keys.length === QUALITY_SCORE_KEYS.length,
    "criterionScores must contain exactly the expected keys.",
    { keys },
  );

  let sum = 0;
  for (const key of QUALITY_SCORE_KEYS) {
    const value = scores[key];
    assert(Number.isInteger(value), `criterionScores.${key} must be an integer.`, {
      key,
      value,
    });
    assert(value >= 0 && value <= 2, `criterionScores.${key} must be in range 0..2.`, {
      key,
      value,
    });
    sum += value;
  }

  return sum;
}

export function validateValidationState(state: ValidationState): void {
  assert(Number.isInteger(state.wordCount) && state.wordCount >= 0, "wordCount must be integer >= 0.", {
    value: state.wordCount,
  });
  assert(typeof state.requiredSectionsPresent === "boolean", "requiredSectionsPresent must be boolean.");
  assert(typeof state.manualConfirmed === "boolean", "manualConfirmed must be boolean.");
  assert(Array.isArray(state.failedChecks), "failedChecks must be an array.");
  assert(state.failedChecks.every((value) => typeof value === "string"), "failedChecks entries must be strings.");

  const derivedQualityBonus = assertQualityScores(state.criterionScores);
  assert(derivedQualityBonus <= 10, "qualityBonus must not exceed 10.");
  assert(state.qualityBonus === derivedQualityBonus, "qualityBonus must equal sum of criterionScores.", {
    expected: derivedQualityBonus,
    actual: state.qualityBonus,
  });

  const expectedFinalPass =
    state.wordCount >= 120 && state.requiredSectionsPresent && state.manualConfirmed;
  assert(
    state.finalPass === expectedFinalPass,
    "finalPass must align with deterministic note gate checks.",
    {
      expected: expectedFinalPass,
      actual: state.finalPass,
    },
  );
}

export function deriveValidationFailureCodes(
  state: ValidationState,
): PersistenceErrorCode[] {
  const codes: PersistenceErrorCode[] = [];

  if (state.wordCount < 120) {
    codes.push(PERSISTENCE_ERROR_CODES.VAL_WORD_COUNT_TOO_LOW);
  }
  if (!state.requiredSectionsPresent) {
    codes.push(PERSISTENCE_ERROR_CODES.VAL_REQUIRED_SECTION_MISSING);
  }
  if (!state.manualConfirmed) {
    codes.push(PERSISTENCE_ERROR_CODES.VAL_MANUAL_CONFIRM_REQUIRED);
  }

  return codes;
}

export function validateRoomMetadata(room: RoomMetadata): void {
  assert(isUlid(room.roomId), "roomId must be a ULID.", { roomId: room.roomId });
  assert(typeof room.topic === "string" && room.topic.trim().length > 0, "topic must be non-empty string.");
  assertIsoDate(room.createdAt, "createdAt");
  assertIsoDate(room.updatedAt, "updatedAt");
  assertEnumValue(room.state, ROOM_STATES, "room.state");
  assert(typeof room.notePath === "string" && room.notePath.length > 0, "notePath must be non-empty string.");
  assert(
    typeof room.artifactPath === "string" && room.artifactPath.length > 0,
    "artifactPath must be non-empty string.",
  );
  assert(Number.isInteger(room.reviewPassCount) && room.reviewPassCount >= 0, "reviewPassCount must be integer >= 0.");
  assert(Array.isArray(room.attachments), "attachments must be an array.");

  validateValidationState(room.validationState);

  for (const attachment of room.attachments) {
    assert(isUlid(attachment.attachmentId), "attachmentId must be ULID.", {
      attachmentId: attachment.attachmentId,
    });
    assert(typeof attachment.fileName === "string" && attachment.fileName.length > 0, "attachment.fileName is required.");
    assert(typeof attachment.mimeType === "string" && attachment.mimeType.length > 0, "attachment.mimeType is required.");
    assert(
      typeof attachment.relativePath === "string" && attachment.relativePath.startsWith("attachments/"),
      "attachment.relativePath must stay within attachments/.",
    );
    assertIsoDate(attachment.addedAt, "attachment.addedAt");
  }
}

export function validateDungeonMetadata(dungeon: DungeonMetadata): void {
  assertSemver(dungeon.schemaVersion);
  assert(isUlid(dungeon.dungeonId), "dungeonId must be a ULID.", {
    dungeonId: dungeon.dungeonId,
  });
  assert(
    typeof dungeon.subjectName === "string" && dungeon.subjectName.trim().length > 0,
    "subjectName must be non-empty string.",
  );
  assertIsoDate(dungeon.createdAt, "createdAt");
  assertIsoDate(dungeon.updatedAt, "updatedAt");
  assertEnumValue(dungeon.phaseState, PHASE_STATES, "phaseState");
  assert(isUlid(dungeon.rootRoomId), "rootRoomId must be ULID.", {
    rootRoomId: dungeon.rootRoomId,
  });
  assert(Array.isArray(dungeon.rooms), "rooms must be an array.");
  assert(Array.isArray(dungeon.edges), "edges must be an array.");
  assert(typeof dungeon.progression === "object" && dungeon.progression !== null, "progression is required.");

  const roomIds = new Set<string>();
  for (const room of dungeon.rooms) {
    assert(isUlid(room.roomId), "dungeon.rooms[].roomId must be ULID.", { roomId: room.roomId });
    assert(!roomIds.has(room.roomId), "roomId values must be unique.", { roomId: room.roomId });
    roomIds.add(room.roomId);
    assert(
      typeof room.topic === "string" && room.topic.trim().length > 0,
      "dungeon.rooms[].topic must be non-empty string.",
    );
    assertEnumValue(room.status, ROOM_STATES, "dungeon.rooms[].status");
  }

  if (!roomIds.has(dungeon.rootRoomId)) {
    throw toPersistenceError("VAL_ROOT_ROOM_INVALID", "rootRoomId must reference an existing room.", {
      rootRoomId: dungeon.rootRoomId,
    });
  }

  for (const edge of dungeon.edges) {
    assert(isUlid(edge.fromRoomId), "edge.fromRoomId must be ULID.");
    assert(isUlid(edge.toRoomId), "edge.toRoomId must be ULID.");
    assertEnumValue(edge.relationType, EDGE_RELATION_TYPES, "edge.relationType");
    assertEnumValue(edge.createdByPhase, EDGE_PHASES, "edge.createdByPhase");
    assertIsoDate(edge.createdAt, "edge.createdAt");

    if (edge.fromRoomId === edge.toRoomId) {
      throw toPersistenceError("SCHEMA_FIELD_INVALID", "Self-loop edges are not allowed.", {
        edge,
      });
    }

    if (!roomIds.has(edge.fromRoomId) || !roomIds.has(edge.toRoomId)) {
      throw toPersistenceError("VAL_EDGE_ORPHAN", "Edge references non-existent room.", {
        edge,
      });
    }
  }

  assert(
    Number.isInteger(dungeon.progression.xpTotal) && dungeon.progression.xpTotal >= 0,
    "progression.xpTotal must be integer >= 0.",
  );
  assert(typeof dungeon.progression.rank === "string" && dungeon.progression.rank.length > 0, "progression.rank is required.");
  assert(Array.isArray(dungeon.progression.badges), "progression.badges must be an array.");
  assert(
    dungeon.progression.badges.every((badge) => typeof badge === "string"),
    "progression.badges entries must be strings.",
  );
}

export function requiresMigration(schemaVersion: string): boolean {
  assertSemver(schemaVersion);
  return schemaVersion !== CURRENT_SCHEMA_VERSION;
}
