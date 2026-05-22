import type {
  DungeonMetadata,
  RoomAttachment,
  RoomMetadata,
  RoomState,
} from "@core/validation/persistence";

export const REVIEW_EVENT_TYPES = ["ROOM_REVIEWED"] as const;

export const REVIEWABLE_ROOM_STATES = [
  "EncounterDefeated",
  "ArtifactCollected",
  "NeedsRevalidation",
] as const satisfies readonly RoomState[];

export type ReviewEventType = (typeof REVIEW_EVENT_TYPES)[number];

export interface ReviewUnlockInput {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
  requiredCompletionRatio?: number;
}

export interface ReviewUnlockStatus {
  requiredCompletionRatio: number;
  completionRatio: number;
  totalRooms: number;
  clearedRooms: number;
  unlocked: boolean;
}

export interface ReviewTraversalRoom {
  roomId: string;
  topic: string;
  state: RoomState;
  reviewPassCount: number;
  attachmentCount: number;
}

export interface ReviewTraversalSnapshot {
  orderedRoomIds: string[];
  roomsById: Record<string, ReviewTraversalRoom>;
  totalReviewableRooms: number;
  reviewedRoomCount: number;
}

export interface BuildReviewTraversalInput {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
}

export interface ArtifactLinkReference {
  label: string;
  href: string;
  isLocal: boolean;
  isResolved: boolean;
  attachmentId?: string;
}

export interface ArtifactAttachmentPresentation {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  relativePath: string;
  isLinkedInMarkdown: boolean;
}

export interface ArtifactPresentationInput {
  roomId: string;
  markdown: string;
  attachments: readonly RoomAttachment[];
}

export interface ArtifactPresentationContract {
  roomId: string;
  markdown: string;
  linkReferences: ArtifactLinkReference[];
  attachments: ArtifactAttachmentPresentation[];
  unresolvedLocalLinks: string[];
}

export interface SelfCheckPromptInput {
  roomId: string;
  subjectName: string;
  roomTopic: string;
  noteHeadings: readonly string[];
  relatedTopics: readonly string[];
  maxPromptCount?: number;
}

export interface SelfCheckPrompt {
  promptId: string;
  text: string;
  source: "topic" | "heading" | "relation";
}

export interface ReviewAnalyticsSnapshot {
  reviewSessionCount: number;
  fullReviewPasses: number;
  currentReviewStreak: number;
  longestReviewStreak: number;
  reviewedRoomCount: number;
  totalReviewableRooms: number;
}

export interface ReviewCountsInput {
  rooms: Record<string, RoomMetadata>;
  reviewableRoomIds: readonly string[];
  currentReviewStreak: number;
  longestReviewStreak: number;
}

export interface ReviewRoomReviewedEvent {
  eventId: string;
  eventType: "ROOM_REVIEWED";
  subjectId: string;
  dungeonId: string;
  roomId: string;
  occurredAt: string;
  reviewSessionCount: number;
  fullReviewPasses: number;
  currentReviewStreak: number;
  longestReviewStreak: number;
}

export interface BuildReviewRoomReviewedEventInput {
  subjectId: string;
  dungeonId: string;
  roomId: string;
  occurredAt: string;
  sequence: number;
  analytics: ReviewAnalyticsSnapshot;
}
