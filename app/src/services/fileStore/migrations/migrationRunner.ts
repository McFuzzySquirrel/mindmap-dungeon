import { toPersistenceError } from "@core/error-catalog";
import {
  CURRENT_SCHEMA_VERSION,
  type DungeonMetadata,
  validateDungeonMetadata,
} from "@core/validation/persistence";

import { writeJsonFileAtomic } from "../atomicIO";
import { resolveDungeonFilePath, type SubjectPathContext } from "../paths";
import { createSubjectBackup, restoreSubjectBackup } from "../backups/backupService";

interface Semver {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(version: string): Semver {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw toPersistenceError(
      "SCHEMA_VERSION_MISSING",
      "schemaVersion must follow semver format.",
      { version },
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left: Semver, right: Semver): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

function applyBackwardCompatibleDefaults(dungeon: DungeonMetadata): DungeonMetadata {
  if (!dungeon.progression.badges) {
    dungeon.progression.badges = [];
  }

  return dungeon;
}

export async function migrateDungeonIfNeeded(
  context: SubjectPathContext,
  dungeon: DungeonMetadata,
): Promise<DungeonMetadata> {
  const current = parseSemver(CURRENT_SCHEMA_VERSION);
  const incoming = parseSemver(dungeon.schemaVersion);
  const comparison = compareSemver(incoming, current);

  if (comparison === 0) {
    return dungeon;
  }

  if (comparison > 0) {
    throw toPersistenceError(
      "MIGRATION_REQUIRED",
      "Dungeon schema is newer than this app version.",
      {
        dungeonSchema: dungeon.schemaVersion,
        appSchema: CURRENT_SCHEMA_VERSION,
      },
    );
  }

  const backupSnapshot = await createSubjectBackup(context, "pre-migration");

  try {
    if (incoming.major < current.major) {
      throw toPersistenceError(
        "MIGRATION_REQUIRED",
        "Major version upgrade requires explicit migration path.",
        {
          from: dungeon.schemaVersion,
          to: CURRENT_SCHEMA_VERSION,
        },
      );
    }

    const migrated = applyBackwardCompatibleDefaults(structuredClone(dungeon));
    migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
    migrated.updatedAt = new Date().toISOString();
    validateDungeonMetadata(migrated);

    await writeJsonFileAtomic(resolveDungeonFilePath(context), migrated);
    return migrated;
  } catch (error) {
    try {
      await restoreSubjectBackup(context, backupSnapshot);
    } catch (restoreError) {
      throw toPersistenceError(
        "BACKUP_RESTORE_FAILED",
        "Migration failed and rollback restore also failed.",
        { error, restoreError },
      );
    }

    if (error instanceof Error && "code" in error) {
      throw error;
    }

    throw toPersistenceError("MIGRATION_FAILED", "Migration failed and changes were rolled back.", error);
  }
}
