import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildProgressSummaryCsv, writeProgressSummaryCsv } from "@services/progressExport";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.map(async (dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("progress export service", () => {
  it("PRG-FR-04 builds deterministic CSV summary rows", () => {
    const csv = buildProgressSummaryCsv({
      summaries: [
        {
          subjectId: "subject-b",
          subjectName: "Biology",
          xpTotal: 410,
          rank: "Scholar",
          badges: ["CreatorPhaseComplete", "ScribePhaseComplete"],
          badgeUnlockTimestamps: {
            CreatorPhaseComplete: "2026-05-22T10:00:00.000Z",
            ScribePhaseComplete: "2026-05-22T10:20:00.000Z",
          },
          rewardHistory: [],
          metrics: {
            totalRooms: 12,
            creatorMappedRooms: 12,
            scribeClearedRooms: 12,
            creatorCompletionRatio: 1,
            scribeCompletionRatio: 1,
            reviewSessionCount: 4,
            fullReviewPasses: 2,
            currentReviewStreak: 2,
            longestReviewStreak: 4,
          },
          lastRewardAt: "2026-05-22T10:20:00.000Z",
        },
        {
          subjectId: "subject-a",
          subjectName: "Algebra",
          xpTotal: 280,
          rank: "Novice",
          badges: ["CreatorPhaseComplete"],
          badgeUnlockTimestamps: {
            CreatorPhaseComplete: "2026-05-22T09:00:00.000Z",
          },
          rewardHistory: [],
          metrics: {
            totalRooms: 10,
            creatorMappedRooms: 9,
            scribeClearedRooms: 5,
            creatorCompletionRatio: 0.9,
            scribeCompletionRatio: 0.5,
            reviewSessionCount: 1,
            fullReviewPasses: 0,
            currentReviewStreak: 1,
            longestReviewStreak: 1,
          },
          lastRewardAt: "2026-05-22T09:00:00.000Z",
        },
      ],
    });

    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toContain("subjectId,subjectName,xpTotal");
    expect(lines[1]?.startsWith('"subject-a"')).toBe(true);
    expect(lines[2]?.startsWith('"subject-b"')).toBe(true);
    expect(lines[1]).toContain("0.9000");
    expect(lines[2]).toContain("1.0000");
  });

  it("PRG-FR-04 writes CSV file locally", async () => {
    const dir = await makeTempDir("mindmap-dungeon-progress-export-");
    const destination = path.join(dir, "exports", "progress-summary.csv");

    const writtenPath = await writeProgressSummaryCsv({
      destinationFilePath: destination,
      summaries: [
        {
          subjectId: "subject-1",
          subjectName: "History",
          xpTotal: 120,
          rank: "Novice",
          badges: [],
          badgeUnlockTimestamps: {},
          rewardHistory: [],
          metrics: {
            totalRooms: 5,
            creatorMappedRooms: 3,
            scribeClearedRooms: 2,
            creatorCompletionRatio: 0.6,
            scribeCompletionRatio: 0.4,
            reviewSessionCount: 0,
            fullReviewPasses: 0,
            currentReviewStreak: 0,
            longestReviewStreak: 0,
          },
        },
      ],
    });

    expect(writtenPath).toBe(destination);
    const fileText = await readFile(destination, "utf8");
    expect(fileText).toContain("subjectId,subjectName,xpTotal");
    expect(fileText).toContain('"subject-1"');
  });
});
