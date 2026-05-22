import type { SubjectProgressionSummary } from "@features/progression";

export interface ProgressSummaryCsvRow {
  subjectId: string;
  subjectName: string;
  xpTotal: number;
  rank: string;
  badgeCount: number;
  creatorBadgeUnlockedAt: string;
  scribeBadgeUnlockedAt: string;
  archaeologistBadgeUnlockedAt: string;
  totalRooms: number;
  creatorMappedRooms: number;
  scribeClearedRooms: number;
  creatorCompletionRatio: number;
  scribeCompletionRatio: number;
  reviewSessionCount: number;
  fullReviewPasses: number;
  currentReviewStreak: number;
  longestReviewStreak: number;
  rewardEventCount: number;
  lastRewardAt: string;
}

export interface BuildProgressSummaryCsvInput {
  summaries: readonly SubjectProgressionSummary[];
}

export interface WriteProgressSummaryCsvInput extends BuildProgressSummaryCsvInput {
  destinationFilePath: string;
}
