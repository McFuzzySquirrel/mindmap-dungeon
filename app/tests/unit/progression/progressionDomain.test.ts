import { describe, expect, it } from "vitest";

import {
  appendRewardHistory,
  buildPostRoomClearBreakdownPayload,
  buildSubjectProgressionSummary,
  createRoomClearRewardHistoryEntries,
  type RewardHistoryEntry,
} from "@features/progression";

describe("progression feature contracts", () => {
  it("PRG-FR-04 builds post-room-clear XP breakdown payload", () => {
    const payload = buildPostRoomClearBreakdownPayload({
      subjectId: "subject-1",
      roomId: "room-1",
      occurredAt: "2026-05-22T10:00:00.000Z",
      xpBreakdown: {
        baseXp: 20,
        qualityBonus: 8,
        streakBonus: 4,
        totalDelta: 32,
      },
      xpTotalBefore: 120,
      xpTotalAfter: 152,
      rankBefore: "Novice",
      rankAfter: "Novice",
      streakCount: 4,
      unlockedBadges: ["CreatorPhaseComplete"],
    });

    expect(payload.xpBreakdown.totalDelta).toBe(32);
    expect(payload.xpBreakdown.totalDelta).toBe(
      payload.xpBreakdown.baseXp +
        payload.xpBreakdown.qualityBonus +
        payload.xpBreakdown.streakBonus,
    );
    expect(payload.xpTotalAfter - payload.xpTotalBefore).toBe(payload.xpBreakdown.totalDelta);
    expect(payload.unlockedBadges).toEqual(["CreatorPhaseComplete"]);
  });

  it("PRG-FR-04 keeps reward history XP deltas aligned with breakdown totals", () => {
    const payload = buildPostRoomClearBreakdownPayload({
      subjectId: "subject-1",
      roomId: "room-3",
      occurredAt: "2026-05-22T10:15:00.000Z",
      xpBreakdown: {
        baseXp: 20,
        qualityBonus: 10,
        streakBonus: 5,
        totalDelta: 35,
      },
      xpTotalBefore: 65,
      xpTotalAfter: 100,
      rankBefore: "Novice",
      rankAfter: "Novice",
      streakCount: 5,
      unlockedBadges: [],
    });

    const entries = createRoomClearRewardHistoryEntries({
      subjectId: payload.subjectId,
      roomId: payload.roomId,
      occurredAt: payload.occurredAt,
      xpBreakdown: payload.xpBreakdown,
      xpTotalBefore: payload.xpTotalBefore,
      xpTotalAfter: payload.xpTotalAfter,
      rankBefore: payload.rankBefore,
      rankAfter: payload.rankAfter,
      unlockedBadges: payload.unlockedBadges,
    });

    const awardedXp = entries
      .filter((entry) => entry.eventType === "ROOM_CLEAR_XP_AWARDED")
      .reduce((total, entry) => total + entry.xpDelta, 0);

    expect(awardedXp).toBe(payload.xpBreakdown.totalDelta);
    expect(awardedXp).toBe(payload.xpTotalAfter - payload.xpTotalBefore);
  });

  it("PRG-FR-03 emits reward history entries for XP, rank, and badges", () => {
    const entries = createRoomClearRewardHistoryEntries({
      subjectId: "subject-1",
      roomId: "room-2",
      occurredAt: "2026-05-22T10:05:00.000Z",
      xpBreakdown: {
        baseXp: 20,
        qualityBonus: 10,
        streakBonus: 5,
        totalDelta: 35,
      },
      xpTotalBefore: 295,
      xpTotalAfter: 330,
      rankBefore: "Novice",
      rankAfter: "Scholar",
      unlockedBadges: ["CreatorPhaseComplete", "ScribePhaseComplete"],
    });

    expect(entries.map((entry) => entry.eventType)).toEqual([
      "ROOM_CLEAR_XP_AWARDED",
      "RANK_CHANGED",
      "BADGE_UNLOCKED",
      "BADGE_UNLOCKED",
    ]);

    const badgeEntries = entries.filter((entry) => entry.eventType === "BADGE_UNLOCKED");
    expect(badgeEntries.map((entry) => entry.badgeId)).toEqual([
      "CreatorPhaseComplete",
      "ScribePhaseComplete",
    ]);
  });

  it("PRG-FR-03 aggregates summary metrics and badge unlock timestamps", () => {
    const rewardHistory: RewardHistoryEntry[] = [
      {
        eventId: "a",
        subjectId: "subject-1",
        occurredAt: "2026-05-22T10:00:00.000Z",
        eventType: "BADGE_UNLOCKED",
        xpDelta: 0,
        xpTotalAfter: 250,
        rankAfter: "Novice",
        badgeId: "CreatorPhaseComplete",
      },
      {
        eventId: "b",
        subjectId: "subject-1",
        occurredAt: "2026-05-22T10:10:00.000Z",
        eventType: "ROOM_CLEAR_XP_AWARDED",
        xpDelta: 30,
        xpTotalAfter: 330,
        rankAfter: "Scholar",
      },
    ];

    const summary = buildSubjectProgressionSummary({
      subjectId: "subject-1",
      subjectName: "Physics",
      xpTotal: 330,
      rank: "Scholar",
      badges: ["CreatorPhaseComplete"],
      rewardHistory,
      completion: {
        totalRooms: 10,
        creatorMappedRooms: 9,
        scribeClearedRooms: 6,
      },
      reviewAnalytics: {
        reviewSessionCount: 3,
        fullReviewPasses: 1,
        currentReviewStreak: 2,
        longestReviewStreak: 4,
      },
    });

    expect(summary.metrics.creatorCompletionRatio).toBe(0.9);
    expect(summary.metrics.scribeCompletionRatio).toBe(0.6);
    expect(summary.badgeUnlockTimestamps.CreatorPhaseComplete).toBe(
      "2026-05-22T10:00:00.000Z",
    );
    expect(summary.lastRewardAt).toBe("2026-05-22T10:10:00.000Z");
  });

  it("PRG-FR-03 appends and sorts reward history deterministically", () => {
    const existing: RewardHistoryEntry[] = [
      {
        eventId: "event-2",
        subjectId: "subject-1",
        occurredAt: "2026-05-22T10:10:00.000Z",
        eventType: "ROOM_CLEAR_XP_AWARDED",
        xpDelta: 20,
        xpTotalAfter: 200,
        rankAfter: "Novice",
      },
    ];

    const appended = appendRewardHistory(existing, [
      {
        eventId: "event-1",
        subjectId: "subject-1",
        occurredAt: "2026-05-22T10:00:00.000Z",
        eventType: "ROOM_CLEAR_XP_AWARDED",
        xpDelta: 20,
        xpTotalAfter: 180,
        rankAfter: "Novice",
      },
    ]);

    expect(appended.map((entry) => entry.eventId)).toEqual(["event-1", "event-2"]);
  });

  it("PRG-FR-03 keeps reward history hidden state explicit when no rewards exist", () => {
    const summary = buildSubjectProgressionSummary({
      subjectId: "subject-2",
      subjectName: "Chemistry",
      xpTotal: 0,
      rank: "Novice",
      badges: [],
      rewardHistory: [],
      completion: {
        totalRooms: 4,
        creatorMappedRooms: 0,
        scribeClearedRooms: 0,
      },
      reviewAnalytics: {
        reviewSessionCount: 0,
        fullReviewPasses: 0,
        currentReviewStreak: 0,
        longestReviewStreak: 0,
      },
    });

    expect(summary.rewardHistory).toEqual([]);
    expect(summary.lastRewardAt).toBeUndefined();
  });
});
