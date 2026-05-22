import type { ArtifactGenerationOutput } from "@core/artifacts";
import type { NoteValidationOutput } from "@core/validation/notes";
import type {
  DungeonMetadata,
  RoomMetadata,
  SubjectSnapshot,
} from "@core/validation/persistence";
import type {
  FileStore,
  LoadedSubject,
} from "@services/fileStore";

export type ScribeDomainErrorCode =
  | "ROOM_NOT_FOUND"
  | "ENCOUNTER_NOT_SPAWNED"
  | "INVALID_OPERATION"
  | "PERSISTENCE_ERROR";

export interface ScribeDomainError {
  code: ScribeDomainErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ScribeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ScribeDomainError };

export interface ScribeEncounterSummary {
  roomId: string;
  topic: string;
  roomState: RoomMetadata["state"];
  encounterRequired: boolean;
  isCleared: boolean;
  hasDraft: boolean;
  latestFailedChecks: string[];
}

export interface ScribeState {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
  encountersByRoomId: Record<string, ScribeEncounterSummary>;
}

export interface ScribeInitializeInput {
  loadedSubject: LoadedSubject;
  nowIso: string;
}

export interface SubmitEncounterNoteInput {
  roomId: string;
  noteText: string;
  manualConfirmed: boolean;
  nowIso: string;
  referenceTerms?: readonly string[];
}

export interface ReviseClearedNoteInput {
  roomId: string;
  noteText: string;
  manualConfirmed: boolean;
  nowIso: string;
  referenceTerms?: readonly string[];
  regenerateArtifact?: boolean;
}

export interface ScribeSubmissionOutcome {
  room: RoomMetadata;
  dungeon: DungeonMetadata;
  validation: NoteValidationOutput;
  artifact?: ArtifactGenerationOutput;
  completionChanged: boolean;
  rewardEligible: boolean;
  encounters: Record<string, ScribeEncounterSummary>;
}

export interface ScribePersistencePort {
  loadDungeon(): Promise<SubjectSnapshot>;
  loadRoom(roomId: string): Promise<RoomMetadata>;
  saveDungeon(dungeon: DungeonMetadata): Promise<void>;
  saveRoom(room: RoomMetadata): Promise<void>;
  saveRoomNote(roomId: string, noteText: string): Promise<RoomMetadata>;
  readRoomNote(roomId: string): Promise<string>;
  saveRoomArtifact(roomId: string, artifactMarkdown: string): Promise<void>;
}

export interface ScribeOrchestrator {
  initialize(input: ScribeInitializeInput): ScribeResult<ScribeState>;
  refresh(): Promise<ScribeResult<ScribeState>>;
  submitEncounterNote(input: SubmitEncounterNoteInput): Promise<ScribeResult<ScribeSubmissionOutcome>>;
  reviseClearedNote(input: ReviseClearedNoteInput): Promise<ScribeResult<ScribeSubmissionOutcome>>;
}

export interface CreateScribeOrchestratorInput {
  persistence: ScribePersistencePort;
}

export function createFileStoreScribePersistence(fileStore: FileStore): ScribePersistencePort {
  return {
    loadDungeon: async () => fileStore.loadDungeon(),
    loadRoom: async (roomId) => fileStore.loadRoom(roomId),
    saveDungeon: async (dungeon) => fileStore.saveDungeon(dungeon),
    saveRoom: async (room) => fileStore.saveRoom(room),
    saveRoomNote: async (roomId, noteText) => fileStore.saveRoomNote(roomId, noteText),
    readRoomNote: async (roomId) => fileStore.readRoomNote(roomId),
    saveRoomArtifact: async (roomId, artifactMarkdown) =>
      fileStore.saveRoomArtifact(roomId, artifactMarkdown),
  };
}