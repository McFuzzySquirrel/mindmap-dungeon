import {
  PERSISTENCE_ERROR_CATALOG,
  isPersistenceError,
  type PersistenceErrorCode,
} from "@core/error-catalog";

export interface ActionableWarning {
  title: string;
  message: string;
  remediation: string;
  code?: PersistenceErrorCode;
  backupGuidance?: string;
}

function toBackupGuidance(code: PersistenceErrorCode): string | undefined {
  if (code === "MIGRATION_REQUIRED" || code === "MIGRATION_FAILED") {
    return "Retry migration with backup enabled. If migration fails, restore from the newest snapshot in the subject .backups folder.";
  }

  if (code === "BACKUP_CREATE_FAILED") {
    return "A backup was not created. Confirm disk space and folder permissions before trying again.";
  }

  if (code === "BACKUP_RESTORE_FAILED") {
    return "Choose a known-good snapshot in the subject .backups folder and retry restore.";
  }

  return undefined;
}

export function buildActionableWarning(
  error: unknown,
  fallbackTitle: string,
): ActionableWarning {
  if (isPersistenceError(error)) {
    const catalogEntry = PERSISTENCE_ERROR_CATALOG[error.code];
    const backupGuidance = toBackupGuidance(error.code);
    return {
      title: fallbackTitle,
      message: catalogEntry.message,
      remediation: error.remediation,
      code: error.code,
      ...(backupGuidance ? { backupGuidance } : {}),
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error.";
  return {
    title: fallbackTitle,
    message,
    remediation: "Review the input values and filesystem permissions, then retry.",
  };
}