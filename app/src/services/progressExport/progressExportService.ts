import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SubjectProgressionSummary } from "@features/progression";

import type {
  BuildProgressSummaryCsvInput,
  ProgressSummaryCsvRow,
  WriteProgressSummaryCsvInput,
} from "./types";

const CSV_HEADERS: readonly (keyof ProgressSummaryCsvRow)[] = [
  "subjectId",
  "subjectName",
  "xpTotal",
  "rank",
  "badgeCount",
  "creatorBadgeUnlockedAt",
  "scribeBadgeUnlockedAt",
  "archaeologistBadgeUnlockedAt",
  "totalRooms",
  "creatorMappedRooms",
  "scribeClearedRooms",
  "creatorCompletionRatio",
  "scribeCompletionRatio",
  "reviewSessionCount",
  "fullReviewPasses",
  "currentReviewStreak",
  "longestReviewStreak",
  "rewardEventCount",
  "lastRewardAt",
] as const;

function toFixedRatio(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, safe)).toFixed(4);
}

function escapeCsvField(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

function mapSummaryToRow(summary: SubjectProgressionSummary): ProgressSummaryCsvRow {
  return {
    subjectId: summary.subjectId,
    subjectName: summary.subjectName,
    xpTotal: summary.xpTotal,
    rank: summary.rank,
    badgeCount: summary.badges.length,
    creatorBadgeUnlockedAt: summary.badgeUnlockTimestamps.CreatorPhaseComplete ?? "",
    scribeBadgeUnlockedAt: summary.badgeUnlockTimestamps.ScribePhaseComplete ?? "",
    archaeologistBadgeUnlockedAt:
      summary.badgeUnlockTimestamps.ArchaeologistPhaseComplete ?? "",
    totalRooms: summary.metrics.totalRooms,
    creatorMappedRooms: summary.metrics.creatorMappedRooms,
    scribeClearedRooms: summary.metrics.scribeClearedRooms,
    creatorCompletionRatio: summary.metrics.creatorCompletionRatio,
    scribeCompletionRatio: summary.metrics.scribeCompletionRatio,
    reviewSessionCount: summary.metrics.reviewSessionCount,
    fullReviewPasses: summary.metrics.fullReviewPasses,
    currentReviewStreak: summary.metrics.currentReviewStreak,
    longestReviewStreak: summary.metrics.longestReviewStreak,
    rewardEventCount: summary.rewardHistory.length,
    lastRewardAt: summary.lastRewardAt ?? "",
  };
}

function serializeRow(row: ProgressSummaryCsvRow): string {
  return CSV_HEADERS.map((header) => {
    const value = row[header];

    if (typeof value === "number") {
      if (header === "creatorCompletionRatio" || header === "scribeCompletionRatio") {
        return toFixedRatio(value);
      }
      return String(Math.trunc(value));
    }

    return escapeCsvField(value);
  }).join(",");
}

export function buildProgressSummaryCsv(input: BuildProgressSummaryCsvInput): string {
  const sortedSummaries = [...input.summaries].sort((left, right) =>
    left.subjectId.localeCompare(right.subjectId),
  );

  const lines = [CSV_HEADERS.join(",")];

  for (const summary of sortedSummaries) {
    const row = mapSummaryToRow(summary);
    lines.push(serializeRow(row));
  }

  return `${lines.join("\n")}\n`;
}

export async function writeProgressSummaryCsv(
  input: WriteProgressSummaryCsvInput,
): Promise<string> {
  const destination = path.resolve(input.destinationFilePath);
  await mkdir(path.dirname(destination), { recursive: true });

  const csv = buildProgressSummaryCsv({ summaries: input.summaries });
  await writeFile(destination, csv, "utf8");

  return destination;
}
