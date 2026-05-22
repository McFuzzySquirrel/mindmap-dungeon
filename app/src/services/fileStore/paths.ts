import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  ensureSafeScopedPath,
  sanitizePathFragment,
} from "@core/validation/persistence";

import {
  ATTACHMENTS_DIRECTORY_NAME,
  BACKUPS_DIRECTORY_NAME,
  DUNGEON_DATA_DIRECTORY,
  DUNGEON_FILE_NAME,
  ROOM_FILE_NAME,
  ROOMS_DIRECTORY_NAME,
} from "./constants";

export interface SubjectPathContext {
  workspaceRoot: string;
  subjectId: string;
}

export function buildSubjectPathContext(
  workspaceRoot: string,
  subjectId: string,
): SubjectPathContext {
  return {
    workspaceRoot,
    subjectId: sanitizePathFragment(subjectId),
  };
}

export function resolveDungeonDataRoot(workspaceRoot: string): string {
  return ensureSafeScopedPath(workspaceRoot, DUNGEON_DATA_DIRECTORY);
}

export function resolveSubjectDirectory(context: SubjectPathContext): string {
  return ensureSafeScopedPath(
    resolveDungeonDataRoot(context.workspaceRoot),
    context.subjectId,
  );
}

export function resolveDungeonFilePath(context: SubjectPathContext): string {
  return ensureSafeScopedPath(resolveSubjectDirectory(context), DUNGEON_FILE_NAME);
}

export function resolveRoomsDirectory(context: SubjectPathContext): string {
  return ensureSafeScopedPath(resolveSubjectDirectory(context), ROOMS_DIRECTORY_NAME);
}

export function resolveRoomDirectory(
  context: SubjectPathContext,
  roomId: string,
): string {
  return ensureSafeScopedPath(resolveRoomsDirectory(context), sanitizePathFragment(roomId));
}

export function resolveRoomMetadataPath(
  context: SubjectPathContext,
  roomId: string,
): string {
  return ensureSafeScopedPath(resolveRoomDirectory(context, roomId), ROOM_FILE_NAME);
}

export function resolveRoomAttachmentDirectory(
  context: SubjectPathContext,
  roomId: string,
): string {
  return ensureSafeScopedPath(
    resolveRoomDirectory(context, roomId),
    ATTACHMENTS_DIRECTORY_NAME,
  );
}

export function resolveBackupDirectory(context: SubjectPathContext): string {
  return ensureSafeScopedPath(resolveSubjectDirectory(context), BACKUPS_DIRECTORY_NAME);
}

export function resolveSettingsDirectory(workspaceRoot: string): string {
  return ensureSafeScopedPath(workspaceRoot, ".mindmap-dungeon");
}

export async function ensureSubjectStructure(context: SubjectPathContext): Promise<void> {
  await mkdir(resolveDungeonDataRoot(context.workspaceRoot), { recursive: true });
  await mkdir(resolveSubjectDirectory(context), { recursive: true });
  await mkdir(resolveRoomsDirectory(context), { recursive: true });
  await mkdir(resolveBackupDirectory(context), { recursive: true });
}

export function getRoomFilePaths(context: SubjectPathContext, roomId: string): {
  roomDirectory: string;
  roomMetadataPath: string;
  notePath: string;
  artifactPath: string;
  attachmentsDirectory: string;
} {
  const roomDirectory = resolveRoomDirectory(context, roomId);
  return {
    roomDirectory,
    roomMetadataPath: path.join(roomDirectory, ROOM_FILE_NAME),
    notePath: path.join(roomDirectory, "notes.txt"),
    artifactPath: path.join(roomDirectory, "artifact.md"),
    attachmentsDirectory: path.join(roomDirectory, ATTACHMENTS_DIRECTORY_NAME),
  };
}
