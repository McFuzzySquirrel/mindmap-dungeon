import type {
  PhaseBadgeId,
  RankTier,
  XpBreakdown,
} from "@core/progression";
import type { ReviewRoomReviewedEvent } from "@core/review";

export const REWARD_HISTORY_EVENT_TYPES = [
  "ROOM_CLEAR_XP_AWARDED",
  "BADGE_UNLOCKED",
  "RANK_CHANGED",
] as const;

export type RewardHistoryEventType = (typeof REWARD_HISTORY_EVENT_TYPES)[number];

export interface RewardHistoryEntry {
  eventId: string;
  subjectId: string;
  occurredAt: string;
  eventType: RewardHistoryEventType;
  xpDelta: number;
  xpTotalAfter: number;
  rankAfter: RankTier;
  badgeId?: PhaseBadgeId;
  details?: Record<string, unknown>;
}

export interface BadgeUnlockTimestamps {
  CreatorPhaseComplete?: string;
  ScribePhaseComplete?: string;
  ArchaeologistPhaseComplete?: string;
}

export interface ReviewAnalyticsSnapshot {
  reviewSessionCount: number;
  fullReviewPasses: number;
  currentReviewStreak: number;
  longestReviewStreak: number;
}

export interface ProgressionCompletionSnapshot {
  totalRooms: number;
  creatorMappedRooms: number;
  scribeClearedRooms: number;
}

export interface SubjectProgressionMetrics {
  totalRooms: number;
  creatorMappedRooms: number;
  scribeClearedRooms: number;
  creatorCompletionRatio: number;
  scribeCompletionRatio: number;
  reviewSessionCount: number;
  fullReviewPasses: number;
  currentReviewStreak: number;
  longestReviewStreak: number;
}

export interface SubjectProgressionSummary {
  subjectId: string;
  subjectName: string;
  xpTotal: number;
  rank: RankTier;
  badges: string[];
  badgeUnlockTimestamps: BadgeUnlockTimestamps;
  rewardHistory: RewardHistoryEntry[];
  metrics: SubjectProgressionMetrics;
  lastRewardAt?: string;
}

export interface PostRoomClearBreakdownPayload {
  subjectId: string;
  roomId: string;
  occurredAt: string;
  xpBreakdown: XpBreakdown;
  xpTotalBefore: number;
  xpTotalAfter: number;
  rankBefore: RankTier;
  rankAfter: RankTier;
  streakCount: number;
  unlockedBadges: PhaseBadgeId[];
}

export interface RoomClearRewardHistoryInput {
  subjectId: string;
  roomId: string;
  occurredAt: string;
  xpBreakdown: XpBreakdown;
  xpTotalBefore: number;
  xpTotalAfter: number;
  rankBefore: RankTier;
  rankAfter: RankTier;
  unlockedBadges: readonly PhaseBadgeId[];
}

export interface BuildSubjectProgressionSummaryInput {
  subjectId: string;
  subjectName: string;
  xpTotal: number;
  rank: RankTier;
  badges: readonly string[];
  rewardHistory: readonly RewardHistoryEntry[];
  completion: ProgressionCompletionSnapshot;
  reviewAnalytics: ReviewAnalyticsSnapshot;
}

export interface ApplyReviewEventsToAnalyticsInput {
  reviewAnalytics: ReviewAnalyticsSnapshot;
  events: readonly ReviewRoomReviewedEvent[];
}
