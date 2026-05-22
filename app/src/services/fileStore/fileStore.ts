import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  toPersistenceError,
  type PersistenceError,
} from "@core/error-catalog";
import {
  CURRENT_SCHEMA_VERSION,
  generateUlid,
  sanitizePathFragment,
  validateDungeonMetadata,
  validateRoomMetadata,
  type DungeonMetadata,
  type RoomMetadata,
} from "@core/validation/persistence";

import {
  readJsonFile,
  readUtf8File,
  writeJsonFileAtomic,
  writeUtf8FileAtomic,
} from "./atomicIO";
import {
  ROOM_ARTIFACT_FILE_NAME,
  ROOM_NOTE_FILE_NAME,
} from "./constants";
import {
  createSubjectBackup,
  pruneBackups,
} from "./backups/backupService";
import { migrateDungeonIfNeeded } from "./migrations/migrationRunner";
import {
  buildSubjectPathContext,
  ensureSubjectStructure,
  resolveDungeonFilePath,
  resolveRoomDirectory,
  resolveRoomMetadataPath,
  resolveSubjectDirectory,
  type SubjectPathContext,
} from "./paths";

export interface FileStoreOptions {
  workspaceRoot: string;
  subjectId: string;
}

export interface LoadedSubject {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export class FileStore {
  private readonly context: SubjectPathContext;

  constructor(options: FileStoreOptions) {
    this.context = buildSubjectPathContext(options.workspaceRoot, options.subjectId);
  }

  static generateDungeonId(): string {
    return generateUlid();
  }

  static generateRoomId(): string {
    return generateUlid();
  }

  static generateAttachmentId(): string {
    return generateUlid();
  }

  static async listSubjects(workspaceRoot: string): Promise<string[]> {
    const root = path.resolve(workspaceRoot, "dungeon-data");
    try {
      const entries = await readdir(root, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw toPersistenceError("IO_READ_FAILED", "Failed to list subjects.", error);
    }
  }

  async initializeSubjectStructure(): Promise<void> {
    await ensureSubjectStructure(this.context);
  }

  async createDungeon(subjectName: string, rootTopic: string): Promise<DungeonMetadata> {
    await this.initializeSubjectStructure();

    const now = new Date().toISOString();
    const roomId = FileStore.generateRoomId();
    const dungeon: DungeonMetadata = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      dungeonId: FileStore.generateDungeonId(),
      subjectName,
      createdAt: now,
      updatedAt: now,
      phaseState: "CreatorActive",
      rootRoomId: roomId,
      rooms: [
        {
          roomId,
          topic: rootTopic,
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

    const room = this.createDefaultRoom(roomId, rootTopic, now);
    await this.saveDungeon(dungeon, false);
    await this.saveRoom(room, false);

    return dungeon;
  }

  async loadDungeon(): Promise<LoadedSubject> {
    await this.initializeSubjectStructure();
    const dungeonPath = resolveDungeonFilePath(this.context);

    let dungeon: DungeonMetadata;
    try {
      dungeon = await readJsonFile<DungeonMetadata>(dungeonPath);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw toPersistenceError(
          "IO_READ_FAILED",
          "Dungeon metadata not found for selected subject.",
          error,
        );
      }
      throw error;
    }

    dungeon = await migrateDungeonIfNeeded(this.context, dungeon);
    validateDungeonMetadata(dungeon);

    const rooms: Record<string, RoomMetadata> = {};
    for (const roomSummary of dungeon.rooms) {
      const room = await this.loadRoom(roomSummary.roomId);
      rooms[room.roomId] = room;
    }

    return { dungeon, rooms };
  }

  async loadRoom(roomId: string): Promise<RoomMetadata> {
    const roomPath = resolveRoomMetadataPath(this.context, roomId);
    const room = await readJsonFile<RoomMetadata>(roomPath);
    validateRoomMetadata(room);
    return room;
  }

  async saveDungeon(
    dungeon: DungeonMetadata,
    createBackup = true,
  ): Promise<void> {
    validateDungeonMetadata(dungeon);
    dungeon.updatedAt = new Date().toISOString();

    if (createBackup) {
      await createSubjectBackup(this.context, "pre-dungeon-write");
    }

    await writeJsonFileAtomic(resolveDungeonFilePath(this.context), dungeon);
    await pruneBackups(this.context);
  }

  async saveRoom(room: RoomMetadata, createBackup = true): Promise<void> {
    validateRoomMetadata(room);
    room.updatedAt = new Date().toISOString();

    if (createBackup) {
      await createSubjectBackup(this.context, "pre-room-write");
    }

    const roomDirectory = resolveRoomDirectory(this.context, room.roomId);
    await mkdir(roomDirectory, { recursive: true });
    await writeJsonFileAtomic(resolveRoomMetadataPath(this.context, room.roomId), room);
    await pruneBackups(this.context);
  }

  async saveRoomNote(roomId: string, noteText: string): Promise<RoomMetadata> {
    const room = await this.loadRoom(roomId);
    const roomDirectory = resolveRoomDirectory(this.context, roomId);

    await createSubjectBackup(this.context, "pre-note-write");
    await writeUtf8FileAtomic(path.join(roomDirectory, ROOM_NOTE_FILE_NAME), noteText);

    room.notePath = ROOM_NOTE_FILE_NAME;
    room.updatedAt = new Date().toISOString();
    await this.saveRoom(room, false);
    return room;
  }

  async readRoomNote(roomId: string): Promise<string> {
    const room = await this.loadRoom(roomId);
    const roomDirectory = resolveRoomDirectory(this.context, roomId);
    return readUtf8File(path.join(roomDirectory, room.notePath));
  }

  async readRoomArtifact(roomId: string): Promise<string> {
    const room = await this.loadRoom(roomId);
    const roomDirectory = resolveRoomDirectory(this.context, roomId);
    return readUtf8File(path.join(roomDirectory, room.artifactPath));
  }

  async saveRoomArtifact(roomId: string, artifactMarkdown: string): Promise<void> {
    const room = await this.loadRoom(roomId);
    const roomDirectory = resolveRoomDirectory(this.context, roomId);

    await createSubjectBackup(this.context, "pre-artifact-write");
    await writeUtf8FileAtomic(
      path.join(roomDirectory, ROOM_ARTIFACT_FILE_NAME),
      artifactMarkdown,
    );

    room.artifactPath = ROOM_ARTIFACT_FILE_NAME;
    await this.saveRoom(room, false);
  }

  async subjectExists(): Promise<boolean> {
    const subjectPath = resolveSubjectDirectory(this.context);
    try {
      const info = await stat(subjectPath);
      return info.isDirectory();
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw toPersistenceError("IO_READ_FAILED", "Unable to read subject directory.", error);
    }
  }

  getSubjectId(): string {
    return this.context.subjectId;
  }

  getSubjectPath(): string {
    return resolveSubjectDirectory(this.context);
  }

  private createDefaultRoom(
    roomId: string,
    topic: string,
    now: string,
  ): RoomMetadata {
    return {
      roomId,
      topic,
      createdAt: now,
      updatedAt: now,
      state: "Created",
      notePath: ROOM_NOTE_FILE_NAME,
      artifactPath: ROOM_ARTIFACT_FILE_NAME,
      validationState: {
        wordCount: 120,
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
}

export function createSubjectIdFromName(subjectName: string): string {
  const sanitized = sanitizePathFragment(subjectName);
  return `${sanitized}-${generateUlid().slice(-6).toLowerCase()}`;
}

export function asPersistenceError(error: unknown): PersistenceError {
  if (error instanceof Error && "code" in error) {
    return error as PersistenceError;
  }

  return toPersistenceError("IO_READ_FAILED", "Unknown persistence error.", error);
}
