import type { PhaseBadgeId } from "@core/progression";

import type {
  ApplyReviewEventsToAnalyticsInput,
  BadgeUnlockTimestamps,
  BuildSubjectProgressionSummaryInput,
  PostRoomClearBreakdownPayload,
  RewardHistoryEntry,
  RoomClearRewardHistoryInput,
  SubjectProgressionSummary,
} from "./types";

function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function toRatio(numerator: number, denominator: number): number {
  const safeDenominator = toNonNegativeInteger(denominator);
  if (safeDenominator === 0) {
    return 0;
  }

  const raw = numerator / safeDenominator;
  return Math.max(0, Math.min(1, raw));
}

function buildRewardEventId(
  subjectId: string,
  roomId: string,
  occurredAt: string,
  suffix: string,
): string {
  return `${subjectId}:${roomId}:${occurredAt}:${suffix}`;
}

function badgeUnlockTimestampFromHistory(
  rewardHistory: readonly RewardHistoryEntry[],
): BadgeUnlockTimestamps {
  const timestamps: BadgeUnlockTimestamps = {};

  for (const entry of rewardHistory) {
    if (entry.eventType !== "BADGE_UNLOCKED" || !entry.badgeId) {
      continue;
    }

    if (!timestamps[entry.badgeId]) {
      timestamps[entry.badgeId] = entry.occurredAt;
    }
  }

  return timestamps;
}

export function buildPostRoomClearBreakdownPayload(input: {
  subjectId: string;
  roomId: string;
  occurredAt: string;
  xpBreakdown: PostRoomClearBreakdownPayload["xpBreakdown"];
  xpTotalBefore: number;
  xpTotalAfter: number;
  rankBefore: PostRoomClearBreakdownPayload["rankBefore"];
  rankAfter: PostRoomClearBreakdownPayload["rankAfter"];
  streakCount: number;
  unlockedBadges: readonly PhaseBadgeId[];
}): PostRoomClearBreakdownPayload {
  return {
    subjectId: input.subjectId,
    roomId: input.roomId,
    occurredAt: input.occurredAt,
    xpBreakdown: {
      baseXp: input.xpBreakdown.baseXp,
      qualityBonus: input.xpBreakdown.qualityBonus,
      streakBonus: input.xpBreakdown.streakBonus,
      totalDelta: input.xpBreakdown.totalDelta,
    },
    xpTotalBefore: toNonNegativeInteger(input.xpTotalBefore),
    xpTotalAfter: toNonNegativeInteger(input.xpTotalAfter),
    rankBefore: input.rankBefore,
    rankAfter: input.rankAfter,
    streakCount: toNonNegativeInteger(input.streakCount),
    unlockedBadges: [...input.unlockedBadges],
  };
}

export function createRoomClearRewardHistoryEntries(
  input: RoomClearRewardHistoryInput,
): RewardHistoryEntry[] {
  const entries: RewardHistoryEntry[] = [
    {
      eventId: buildRewardEventId(input.subjectId, input.roomId, input.occurredAt, "xp"),
      subjectId: input.subjectId,
      occurredAt: input.occurredAt,
      eventType: "ROOM_CLEAR_XP_AWARDED",
      xpDelta: toNonNegativeInteger(input.xpBreakdown.totalDelta),
      xpTotalAfter: toNonNegativeInteger(input.xpTotalAfter),
      rankAfter: input.rankAfter,
      details: {
        roomId: input.roomId,
        baseXp: input.xpBreakdown.baseXp,
        qualityBonus: input.xpBreakdown.qualityBonus,
        streakBonus: input.xpBreakdown.streakBonus,
      },
    },
  ];

  if (input.rankAfter !== input.rankBefore) {
    entries.push({
      eventId: buildRewardEventId(input.subjectId, input.roomId, input.occurredAt, "rank"),
      subjectId: input.subjectId,
      occurredAt: input.occurredAt,
      eventType: "RANK_CHANGED",
      xpDelta: 0,
      xpTotalAfter: toNonNegativeInteger(input.xpTotalAfter),
      rankAfter: input.rankAfter,
      details: {
        previousRank: input.rankBefore,
        nextRank: input.rankAfter,
      },
    });
  }

  for (const badgeId of input.unlockedBadges) {
    entries.push({
      eventId: buildRewardEventId(
        input.subjectId,
        input.roomId,
        input.occurredAt,
        `badge:${badgeId}`,
      ),
      subjectId: input.subjectId,
      occurredAt: input.occurredAt,
      eventType: "BADGE_UNLOCKED",
      xpDelta: 0,
      xpTotalAfter: toNonNegativeInteger(input.xpTotalAfter),
      rankAfter: input.rankAfter,
      badgeId,
      details: {
        roomId: input.roomId,
      },
    });
  }

  return entries;
}

export function appendRewardHistory(
  rewardHistory: readonly RewardHistoryEntry[],
  newEntries: readonly RewardHistoryEntry[],
  maxEntries = 500,
): RewardHistoryEntry[] {
  const merged = [...rewardHistory, ...newEntries];

  merged.sort((left, right) => {
    if (left.occurredAt === right.occurredAt) {
      return left.eventId.localeCompare(right.eventId);
    }
    return left.occurredAt.localeCompare(right.occurredAt);
  });

  if (merged.length <= maxEntries) {
    return merged;
  }

  return merged.slice(merged.length - maxEntries);
}

export function buildSubjectProgressionSummary(
  input: BuildSubjectProgressionSummaryInput,
): SubjectProgressionSummary {
  const totalRooms = toNonNegativeInteger(input.completion.totalRooms);
  const creatorMappedRooms = toNonNegativeInteger(input.completion.creatorMappedRooms);
  const scribeClearedRooms = toNonNegativeInteger(input.completion.scribeClearedRooms);
  const reviewSessionCount = toNonNegativeInteger(input.reviewAnalytics.reviewSessionCount);
  const fullReviewPasses = toNonNegativeInteger(input.reviewAnalytics.fullReviewPasses);
  const currentReviewStreak = toNonNegativeInteger(input.reviewAnalytics.currentReviewStreak);
  const longestReviewStreak = toNonNegativeInteger(input.reviewAnalytics.longestReviewStreak);

  const history = [...input.rewardHistory].sort((left, right) => {
    if (left.occurredAt === right.occurredAt) {
      return left.eventId.localeCompare(right.eventId);
    }
    return left.occurredAt.localeCompare(right.occurredAt);
  });

  const lastReward = history.length > 0 ? history[history.length - 1] : null;

  return {
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    xpTotal: toNonNegativeInteger(input.xpTotal),
    rank: input.rank,
    badges: [...input.badges],
    badgeUnlockTimestamps: badgeUnlockTimestampFromHistory(history),
    rewardHistory: history,
    metrics: {
      totalRooms,
      creatorMappedRooms,
      scribeClearedRooms,
      creatorCompletionRatio: toRatio(creatorMappedRooms, totalRooms),
      scribeCompletionRatio: toRatio(scribeClearedRooms, totalRooms),
      reviewSessionCount,
      fullReviewPasses,
      currentReviewStreak,
      longestReviewStreak,
    },
    ...(lastReward ? { lastRewardAt: lastReward.occurredAt } : {}),
  };
}

export function applyReviewEventsToAnalytics(
  input: ApplyReviewEventsToAnalyticsInput,
): BuildSubjectProgressionSummaryInput["reviewAnalytics"] {
  const events = [...input.events].sort((left, right) => {
    if (left.occurredAt === right.occurredAt) {
      return left.eventId.localeCompare(right.eventId);
    }

    return left.occurredAt.localeCompare(right.occurredAt);
  });

  let reviewSessionCount = toNonNegativeInteger(input.reviewAnalytics.reviewSessionCount);
  let fullReviewPasses = toNonNegativeInteger(input.reviewAnalytics.fullReviewPasses);
  let currentReviewStreak = toNonNegativeInteger(input.reviewAnalytics.currentReviewStreak);
  let longestReviewStreak = toNonNegativeInteger(input.reviewAnalytics.longestReviewStreak);

  for (const event of events) {
    reviewSessionCount = Math.max(reviewSessionCount, toNonNegativeInteger(event.reviewSessionCount));
    fullReviewPasses = Math.max(fullReviewPasses, toNonNegativeInteger(event.fullReviewPasses));
    currentReviewStreak = toNonNegativeInteger(event.currentReviewStreak);
    longestReviewStreak = Math.max(
      longestReviewStreak,
      toNonNegativeInteger(event.longestReviewStreak),
    );
  }

  return {
    reviewSessionCount,
    fullReviewPasses,
    currentReviewStreak,
    longestReviewStreak,
  };
}
