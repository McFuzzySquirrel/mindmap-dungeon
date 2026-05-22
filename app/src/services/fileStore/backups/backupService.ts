import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { toPersistenceError } from "@core/error-catalog";

import { MAX_BACKUP_SNAPSHOTS } from "../constants";
import {
  resolveBackupDirectory,
  resolveSubjectDirectory,
  type SubjectPathContext,
} from "../paths";

function makeSnapshotId(label?: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const sanitizedLabel = label ? label.replace(/[^a-zA-Z0-9_-]/g, "-") : "snapshot";
  return `${timestamp}--${sanitizedLabel}`;
}

async function copySubjectIntoSnapshot(
  subjectPath: string,
  backupPath: string,
): Promise<void> {
  const entries = await readdir(subjectPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".backups") {
      continue;
    }

    await cp(path.join(subjectPath, entry.name), path.join(backupPath, entry.name), {
      recursive: true,
      errorOnExist: false,
      force: true,
    });
  }
}

export async function createSubjectBackup(
  context: SubjectPathContext,
  label?: string,
): Promise<string> {
  const subjectPath = resolveSubjectDirectory(context);
  const backupRoot = resolveBackupDirectory(context);
  const snapshotName = makeSnapshotId(label);
  const snapshotPath = path.join(backupRoot, snapshotName);

  try {
    await mkdir(backupRoot, { recursive: true });
    await mkdir(snapshotPath, { recursive: true });
    await copySubjectIntoSnapshot(subjectPath, snapshotPath);
    await pruneBackups(context, MAX_BACKUP_SNAPSHOTS);
    return snapshotPath;
  } catch (error) {
    throw toPersistenceError(
      "BACKUP_CREATE_FAILED",
      "Failed to create backup snapshot.",
      error,
    );
  }
}

export async function pruneBackups(
  context: SubjectPathContext,
  keepCount = MAX_BACKUP_SNAPSHOTS,
): Promise<void> {
  const backupRoot = resolveBackupDirectory(context);
  const entries = await readdir(backupRoot, { withFileTypes: true });
  const snapshots = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  const toDelete = snapshots.slice(keepCount);
  for (const snapshot of toDelete) {
    await rm(path.join(backupRoot, snapshot), { recursive: true, force: true });
  }
}

async function clearSubjectDirectory(subjectPath: string): Promise<void> {
  const entries = await readdir(subjectPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".backups") {
      continue;
    }

    await rm(path.join(subjectPath, entry.name), { recursive: true, force: true });
  }
}

export async function restoreSubjectBackup(
  context: SubjectPathContext,
  snapshotPath: string,
): Promise<void> {
  const subjectPath = resolveSubjectDirectory(context);

  try {
    await clearSubjectDirectory(subjectPath);

    const snapshotEntries = await readdir(snapshotPath, { withFileTypes: true });
    for (const entry of snapshotEntries) {
      await cp(path.join(snapshotPath, entry.name), path.join(subjectPath, entry.name), {
        recursive: true,
        errorOnExist: false,
        force: true,
      });
    }
  } catch (error) {
    throw toPersistenceError(
      "BACKUP_RESTORE_FAILED",
      "Failed to restore subject from backup snapshot.",
      error,
    );
  }
}
