export const PERSISTENCE_ERROR_CODES = {
  VAL_WORD_COUNT_TOO_LOW: "VAL_WORD_COUNT_TOO_LOW",
  VAL_REQUIRED_SECTION_MISSING: "VAL_REQUIRED_SECTION_MISSING",
  VAL_MANUAL_CONFIRM_REQUIRED: "VAL_MANUAL_CONFIRM_REQUIRED",
  VAL_ENUM_INVALID: "VAL_ENUM_INVALID",
  VAL_EDGE_ORPHAN: "VAL_EDGE_ORPHAN",
  VAL_ROOT_ROOM_INVALID: "VAL_ROOT_ROOM_INVALID",
  SCHEMA_VERSION_MISSING: "SCHEMA_VERSION_MISSING",
  SCHEMA_FIELD_INVALID: "SCHEMA_FIELD_INVALID",
  IO_READ_FAILED: "IO_READ_FAILED",
  IO_WRITE_FAILED: "IO_WRITE_FAILED",
  MIGRATION_REQUIRED: "MIGRATION_REQUIRED",
  MIGRATION_FAILED: "MIGRATION_FAILED",
  BACKUP_CREATE_FAILED: "BACKUP_CREATE_FAILED",
  BACKUP_RESTORE_FAILED: "BACKUP_RESTORE_FAILED",
} as const;

export type PersistenceErrorCode =
  (typeof PERSISTENCE_ERROR_CODES)[keyof typeof PERSISTENCE_ERROR_CODES];

export interface PersistenceErrorCatalogEntry {
  code: PersistenceErrorCode;
  message: string;
  remediation: string;
}

export const PERSISTENCE_ERROR_CATALOG: Record<
  PersistenceErrorCode,
  PersistenceErrorCatalogEntry
> = {
  VAL_WORD_COUNT_TOO_LOW: {
    code: "VAL_WORD_COUNT_TOO_LOW",
    message: "Note did not meet the minimum word count.",
    remediation: "Add more detail to the note until it reaches 120+ words.",
  },
  VAL_REQUIRED_SECTION_MISSING: {
    code: "VAL_REQUIRED_SECTION_MISSING",
    message: "One or more required note sections are missing.",
    remediation:
      "Ensure Summary, Key Points, and Recall Question sections are present.",
  },
  VAL_MANUAL_CONFIRM_REQUIRED: {
    code: "VAL_MANUAL_CONFIRM_REQUIRED",
    message: "Manual confirmation has not been completed.",
    remediation: "Confirm the note manually before marking the room as passed.",
  },
  VAL_ENUM_INVALID: {
    code: "VAL_ENUM_INVALID",
    message: "An enum value is invalid for this schema.",
    remediation: "Update the value to one of the supported enum members.",
  },
  VAL_EDGE_ORPHAN: {
    code: "VAL_EDGE_ORPHAN",
    message: "An edge references a room that does not exist.",
    remediation: "Remove or fix edges so both room references exist.",
  },
  VAL_ROOT_ROOM_INVALID: {
    code: "VAL_ROOT_ROOM_INVALID",
    message: "The root room is missing or invalid.",
    remediation: "Set rootRoomId to an existing room identifier.",
  },
  SCHEMA_VERSION_MISSING: {
    code: "SCHEMA_VERSION_MISSING",
    message: "schemaVersion is missing or malformed.",
    remediation: "Provide a valid semver schemaVersion value.",
  },
  SCHEMA_FIELD_INVALID: {
    code: "SCHEMA_FIELD_INVALID",
    message: "A schema field failed validation.",
    remediation: "Inspect field constraints and correct the invalid value.",
  },
  IO_READ_FAILED: {
    code: "IO_READ_FAILED",
    message: "Failed to read data from disk.",
    remediation: "Check file permissions and file integrity, then retry.",
  },
  IO_WRITE_FAILED: {
    code: "IO_WRITE_FAILED",
    message: "Failed to write data to disk.",
    remediation: "Check available disk space and write permissions, then retry.",
  },
  MIGRATION_REQUIRED: {
    code: "MIGRATION_REQUIRED",
    message: "A schema migration is required before loading this dungeon.",
    remediation:
      "Run migration with backup enabled or open with a compatible app version.",
  },
  MIGRATION_FAILED: {
    code: "MIGRATION_FAILED",
    message: "Schema migration failed.",
    remediation: "Restore from the latest backup and inspect migration logs.",
  },
  BACKUP_CREATE_FAILED: {
    code: "BACKUP_CREATE_FAILED",
    message: "Backup creation failed.",
    remediation: "Verify subject folder permissions and available disk space.",
  },
  BACKUP_RESTORE_FAILED: {
    code: "BACKUP_RESTORE_FAILED",
    message: "Backup restore failed.",
    remediation:
      "Retry restore from a known-good snapshot and check file permissions.",
  },
};

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly remediation: string;
  readonly details?: unknown;

  constructor(code: PersistenceErrorCode, message?: string, details?: unknown) {
    const entry = PERSISTENCE_ERROR_CATALOG[code];
    super(message ?? entry.message);
    this.name = "PersistenceError";
    this.code = code;
    this.remediation = entry.remediation;
    this.details = details;
  }
}

export function toPersistenceError(
  code: PersistenceErrorCode,
  message?: string,
  details?: unknown,
): PersistenceError {
  return new PersistenceError(code, message, details);
}

export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}
