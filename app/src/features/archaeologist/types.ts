import type {
  ArtifactPresentationContract,
  ReviewAnalyticsSnapshot,
  ReviewRoomReviewedEvent,
  ReviewTraversalSnapshot,
  ReviewUnlockStatus,
  SelfCheckPrompt,
} from "@core/review";
import type {
  DungeonMetadata,
  RoomMetadata,
  SubjectSnapshot,
} from "@core/validation/persistence";
import type {
  FileStore,
  LoadedSubject,
} from "@services/fileStore";

export type ArchaeologistDomainErrorCode =
  | "REVIEW_LOCKED"
  | "ROOM_NOT_FOUND"
  | "ROOM_NOT_REVIEWABLE"
  | "ARTIFACT_NOT_FOUND"
  | "PERSISTENCE_ERROR"
  | "INVALID_OPERATION";

export interface ArchaeologistDomainError {
  code: ArchaeologistDomainErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ArchaeologistResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ArchaeologistDomainError };

export interface ArchaeologistSessionState {
  startedAt: string;
  reviewedRoomIds: string[];
  currentStreak: number;
  longestStreak: number;
  eventSequence: number;
}

export interface ArchaeologistState {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
  unlock: ReviewUnlockStatus;
  traversal: ReviewTraversalSnapshot;
  analytics: ReviewAnalyticsSnapshot;
  session?: ArchaeologistSessionState;
}

export interface ArchaeologistInitializeInput {
  loadedSubject?: LoadedSubject;
  nowIso: string;
  requiredCompletionRatio?: number;
}

export interface ArchaeologistReviewRoomInput {
  roomId: string;
  nowIso: string;
  maxPromptCount?: number;
}

export interface ArchaeologistReviewRoomOutput {
  state: ArchaeologistState;
  room: RoomMetadata;
  artifact: ArtifactPresentationContract;
  prompts: SelfCheckPrompt[];
  event: ReviewRoomReviewedEvent;
}

export interface ArchaeologistPersistencePort {
  loadDungeon(): Promise<SubjectSnapshot>;
  loadRoom(roomId: string): Promise<RoomMetadata>;
  saveDungeon(dungeon: DungeonMetadata): Promise<void>;
  saveRoom(room: RoomMetadata): Promise<void>;
  readRoomArtifact(roomId: string): Promise<string>;
}

export interface CreateArchaeologistOrchestratorInput {
  persistence: ArchaeologistPersistencePort;
  requiredCompletionRatio?: number;
}

export interface ArchaeologistOrchestrator {
  initialize(input: ArchaeologistInitializeInput): Promise<ArchaeologistResult<ArchaeologistState>>;
  refresh(nowIso: string): Promise<ArchaeologistResult<ArchaeologistState>>;
  startSession(nowIso: string): Promise<ArchaeologistResult<ArchaeologistState>>;
  reviewRoom(input: ArchaeologistReviewRoomInput): Promise<ArchaeologistResult<ArchaeologistReviewRoomOutput>>;
}

export function createFileStoreArchaeologistPersistence(
  fileStore: FileStore,
): ArchaeologistPersistencePort {
  return {
    loadDungeon: async () => fileStore.loadDungeon(),
    loadRoom: async (roomId) => fileStore.loadRoom(roomId),
    saveDungeon: async (dungeon) => fileStore.saveDungeon(dungeon),
    saveRoom: async (room) => fileStore.saveRoom(room),
    readRoomArtifact: async (roomId) => fileStore.readRoomArtifact(roomId),
  };
}
