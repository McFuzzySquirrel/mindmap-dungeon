import { describe, expect, it } from "vitest";

import {
  assignRankTier,
  awardRoomClearProgression,
  calculateRoomXpBreakdown,
  evaluatePhaseBadgeUnlocks,
} from "@core/progression";

describe("progression engine", () => {
  it("PRG-FR-01 applies deterministic XP formula with bounded bonuses", () => {
    const breakdown = calculateRoomXpBreakdown({
      qualityBonus: 12,
      streakCount: 8,
    });

    expect(breakdown).toEqual({
      baseXp: 20,
      qualityBonus: 10,
      streakBonus: 5,
      totalDelta: 35,
    });
    expect(breakdown.totalDelta).toBe(
      breakdown.baseXp + breakdown.qualityBonus + breakdown.streakBonus,
    );
  });

  it("PRG-FR-02 enforces badge threshold boundaries", () => {
    const belowCreatorThreshold = evaluatePhaseBadgeUnlocks(
      {
        totalRooms: 10,
        creatorMappedRooms: 8,
        scribeClearedRooms: 9,
        archaeologistFullReviewPasses: 1,
      },
      [],
    );

    expect(belowCreatorThreshold).toEqual([]);

    const atThresholds = evaluatePhaseBadgeUnlocks(
      {
        totalRooms: 10,
        creatorMappedRooms: 9,
        scribeClearedRooms: 10,
        archaeologistFullReviewPasses: 2,
      },
      [],
    );

    expect(atThresholds).toEqual([
      "CreatorPhaseComplete",
      "ScribePhaseComplete",
      "ArchaeologistPhaseComplete",
    ]);
  });

  it("PRG-FR-02 unlocks badges only at configured thresholds", () => {
    const unlocked = evaluatePhaseBadgeUnlocks(
      {
        totalRooms: 10,
        creatorMappedRooms: 9,
        scribeClearedRooms: 10,
        archaeologistFullReviewPasses: 2,
      },
      ["CreatorPhaseComplete"],
    );

    expect(unlocked).toEqual([
      "ScribePhaseComplete",
      "ArchaeologistPhaseComplete",
    ]);
  });

  it("PRG-FR-03 assigns rank tier from cumulative XP", () => {
    expect(assignRankTier(0)).toBe("Novice");
    expect(assignRankTier(299)).toBe("Novice");
    expect(assignRankTier(300)).toBe("Scholar");
    expect(assignRankTier(799)).toBe("Scholar");
    expect(assignRankTier(800)).toBe("Master");
  });

  it("PRG-FR-01/02/03 awards room clear and returns progression snapshot", () => {
    const reward = awardRoomClearProgression({
      currentXpTotal: 295,
      existingBadges: [],
      qualityBonus: 7,
      streakCount: 3,
      badgeProgress: {
        totalRooms: 10,
        creatorMappedRooms: 9,
        scribeClearedRooms: 10,
        archaeologistFullReviewPasses: 2,
      },
    });

    expect(reward.ok).toBe(true);
    if (!reward.ok) {
      return;
    }

    expect(reward.value.xpBreakdown.totalDelta).toBe(30);
    expect(reward.value.xpTotalBefore).toBe(295);
    expect(reward.value.xpTotalAfter).toBe(325);
    expect(reward.value.rankBefore).toBe("Novice");
    expect(reward.value.rankAfter).toBe("Scholar");
    expect(reward.value.unlockedBadges).toEqual([
      "CreatorPhaseComplete",
      "ScribePhaseComplete",
      "ArchaeologistPhaseComplete",
    ]);
    expect(reward.value.progressionSnapshot.badges).toEqual([
      "CreatorPhaseComplete",
      "ScribePhaseComplete",
      "ArchaeologistPhaseComplete",
    ]);
    expect(reward.value.progressionSnapshot.rank).toBe("Scholar");
  });
});
