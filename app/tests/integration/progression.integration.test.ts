import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { assignRankTier, awardRoomClearProgression, type RankTier } from "@core/progression";
import { type LoadedSubject, FileStore } from "@services/fileStore";
import { buildProgressSummaryCsv } from "@services/progressExport";
import {
  appendRewardHistory,
  buildPostRoomClearBreakdownPayload,
  buildSubjectProgressionSummary,
  createRoomClearRewardHistoryEntries,
} from "@features/progression";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.map(async (dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

function deriveProgressionFromLoadedSubject(loaded: LoadedSubject): ReturnType<typeof buildSubjectProgressionSummary> {
  const dungeonRooms = loaded.dungeon.rooms;
  const totalRooms = dungeonRooms.length;
  const creatorMappedRooms = dungeonRooms.filter((room) => room.status !== "Uncreated").length;

  const clearedRooms = dungeonRooms
    .map((roomSummary) => loaded.rooms[roomSummary.roomId])
    .filter((room): room is NonNullable<typeof room> => Boolean(room))
    .filter(
      (room) =>
        (room.state === "EncounterDefeated" ||
          room.state === "ArtifactCollected" ||
          room.state === "NeedsRevalidation") &&
        room.validationState.finalPass,
    )
    .sort((left, right) => {
      if (left.updatedAt === right.updatedAt) {
        return left.roomId.localeCompare(right.roomId);
      }
      return left.updatedAt.localeCompare(right.updatedAt);
    });

  const reviewPassCount = Object.values(loaded.rooms).reduce(
    (total, room) => total + Math.max(0, Math.trunc(room.reviewPassCount)),
    0,
  );
  const fullReviewPasses = totalRooms > 0 ? Math.trunc(reviewPassCount / totalRooms) : 0;

  let replayXpTotal = 0;
  let replayRank: RankTier = assignRankTier(0);
  let replayBadges: string[] = [];
  let rewardHistory: ReturnType<typeof buildSubjectProgressionSummary>["rewardHistory"] = [];

  for (let index = 0; index < clearedRooms.length; index += 1) {
    const room = clearedRooms[index];
    if (!room) {
      continue;
    }

    const awardResult = awardRoomClearProgression({
      currentXpTotal: replayXpTotal,
      existingBadges: replayBadges,
      qualityBonus: room.validationState.qualityBonus,
      streakCount: index + 1,
      badgeProgress: {
        totalRooms,
        creatorMappedRooms,
        scribeClearedRooms: index + 1,
        archaeologistFullReviewPasses: fullReviewPasses,
      },
    });

    expect(awardResult.ok).toBe(true);
    if (!awardResult.ok) {
      continue;
    }

    const payload = buildPostRoomClearBreakdownPayload({
      subjectId: loaded.dungeon.dungeonId,
      roomId: room.roomId,
      occurredAt: room.updatedAt,
      xpBreakdown: awardResult.value.xpBreakdown,
      xpTotalBefore: awardResult.value.xpTotalBefore,
      xpTotalAfter: awardResult.value.xpTotalAfter,
      rankBefore: awardResult.value.rankBefore,
      rankAfter: awardResult.value.rankAfter,
      streakCount: index + 1,
      unlockedBadges: awardResult.value.unlockedBadges,
    });

    expect(payload.xpBreakdown.totalDelta).toBe(
      payload.xpBreakdown.baseXp +
        payload.xpBreakdown.qualityBonus +
        payload.xpBreakdown.streakBonus,
    );
    expect(payload.xpTotalAfter - payload.xpTotalBefore).toBe(payload.xpBreakdown.totalDelta);

    const entries = createRoomClearRewardHistoryEntries({
      subjectId: loaded.dungeon.dungeonId,
      roomId: room.roomId,
      occurredAt: room.updatedAt,
      xpBreakdown: awardResult.value.xpBreakdown,
      xpTotalBefore: awardResult.value.xpTotalBefore,
      xpTotalAfter: awardResult.value.xpTotalAfter,
      rankBefore: awardResult.value.rankBefore,
      rankAfter: awardResult.value.rankAfter,
      unlockedBadges: awardResult.value.unlockedBadges,
    });
    rewardHistory = appendRewardHistory(rewardHistory, entries);

    replayXpTotal = awardResult.value.xpTotalAfter;
    replayRank = awardResult.value.rankAfter;
    replayBadges = [...awardResult.value.progressionSnapshot.badges];
  }

  return buildSubjectProgressionSummary({
    subjectId: loaded.dungeon.dungeonId,
    subjectName: loaded.dungeon.subjectName,
    xpTotal: replayXpTotal,
    rank: replayRank,
    badges: replayBadges,
    rewardHistory,
    completion: {
      totalRooms,
      creatorMappedRooms,
      scribeClearedRooms: clearedRooms.length,
    },
    reviewAnalytics: {
      reviewSessionCount: reviewPassCount,
      fullReviewPasses,
      currentReviewStreak: Math.min(fullReviewPasses, 1),
      longestReviewStreak: fullReviewPasses,
    },
  });
}

describe("progression integration", () => {
  it("PRG-FR-01/02/03/04 replays rewards from persisted rooms and exports consistent summary metrics", async () => {
    vi.useFakeTimers();

    const workspaceRoot = await makeTempDir("mindmap-dungeon-progression-");
    const subjectId = "progression-integration-1";
    const store = new FileStore({ workspaceRoot, subjectId });

    const dungeon = await store.createDungeon("Biology 101", "Cells");
    const secondRoomId = FileStore.generateRoomId();

    const loaded = await store.loadDungeon();
    const rootRoom = loaded.rooms[dungeon.rootRoomId];

    expect(rootRoom).toBeDefined();
    if (!rootRoom) {
      return;
    }

    const firstClearedAt = "2026-05-22T10:00:00.000Z";
    const secondClearedAt = "2026-05-22T10:10:00.000Z";

    const roomOne = {
      ...rootRoom,
      updatedAt: firstClearedAt,
      state: "EncounterDefeated" as const,
      validationState: {
        ...rootRoom.validationState,
        criterionScores: {
          sectionCompleteness: 2,
          conceptTermCoverage: 1,
          linkReferences: 1,
          recallQuestionQuality: 1,
          clarityReadability: 2,
        },
        qualityBonus: 7,
        finalPass: true,
      },
      reviewPassCount: 2,
    };

    const roomTwo = {
      ...rootRoom,
      roomId: secondRoomId,
      topic: "Cell Organelles",
      createdAt: secondClearedAt,
      updatedAt: secondClearedAt,
      state: "ArtifactCollected" as const,
      validationState: {
        ...rootRoom.validationState,
        criterionScores: {
          sectionCompleteness: 2,
          conceptTermCoverage: 2,
          linkReferences: 2,
          recallQuestionQuality: 2,
          clarityReadability: 1,
        },
        qualityBonus: 9,
        finalPass: true,
      },
      reviewPassCount: 2,
    };

    loaded.dungeon.rooms = [
      { roomId: dungeon.rootRoomId, topic: "Cells", status: roomOne.state },
      { roomId: secondRoomId, topic: "Cell Organelles", status: roomTwo.state },
    ];

    loaded.rooms[dungeon.rootRoomId] = roomOne;
    loaded.rooms[secondRoomId] = roomTwo;

    vi.setSystemTime(new Date("2026-05-22T09:50:00.000Z"));
    await store.saveDungeon(loaded.dungeon, false);
    vi.setSystemTime(new Date(firstClearedAt));
    await store.saveRoom(roomOne, false);
    vi.setSystemTime(new Date(secondClearedAt));
    await store.saveRoom(roomTwo, false);

    const reopened = await store.loadDungeon();
    const summary = deriveProgressionFromLoadedSubject(reopened);

    expect(summary.rank).toBe(assignRankTier(summary.xpTotal));
    expect(summary.badges).toEqual([
      "CreatorPhaseComplete",
      "ArchaeologistPhaseComplete",
      "ScribePhaseComplete",
    ]);
    expect(summary.rewardHistory.length).toBeGreaterThan(0);
    expect(summary.lastRewardAt).toBe(secondClearedAt);

    const awardedXpTotal = summary.rewardHistory
      .filter((entry) => entry.eventType === "ROOM_CLEAR_XP_AWARDED")
      .reduce((total, entry) => total + entry.xpDelta, 0);
    expect(awardedXpTotal).toBe(summary.xpTotal);

    const csv = buildProgressSummaryCsv({ summaries: [summary] });
    const lines = csv.trimEnd().split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("rewardEventCount");
    expect(lines[1]).toContain(`,${summary.rewardHistory.length},`);
    expect(lines[1]).toContain(`,${summary.metrics.fullReviewPasses},`);
  });
});
