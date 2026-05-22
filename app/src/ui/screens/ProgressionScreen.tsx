import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import { assignRankTier, awardRoomClearProgression, type RankTier } from "@core/progression";
import { type RoomState } from "@core/validation/persistence";
import {
  appendRewardHistory,
  buildPostRoomClearBreakdownPayload,
  buildSubjectProgressionSummary,
  createRoomClearRewardHistoryEntries,
  type PostRoomClearBreakdownPayload,
  type SubjectProgressionSummary,
} from "@features/progression";
import { FileStore } from "@services/fileStore";
import { writeProgressSummaryCsv } from "@services/progressExport";

import { buildActionableWarning, type ActionableWarning } from "./foundationWarnings";

const DEFAULT_WORKSPACE_ROOT = ".";
const BADGE_IDS = [
  "CreatorPhaseComplete",
  "ScribePhaseComplete",
  "ArchaeologistPhaseComplete",
] as const;
const CLEARED_ROOM_STATES: RoomState[] = [
  "EncounterDefeated",
  "ArtifactCollected",
  "NeedsRevalidation",
];

interface DerivedProgressionState {
  summary: SubjectProgressionSummary;
  rewardBreakdowns: PostRoomClearBreakdownPayload[];
  replayXpTotal: number;
}

function isRankTier(value: string): value is RankTier {
  return value === "Novice" || value === "Scholar" || value === "Master";
}

function isClearedRoomState(state: RoomState): boolean {
  return CLEARED_ROOM_STATES.includes(state);
}

function toPercentText(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function deriveProgressionState(input: {
  subjectId: string;
  subjectName: string;
  progression: { xpTotal: number; rank: string; badges: string[] };
  dungeonRooms: Array<{ roomId: string; status: RoomState }>;
  rooms: Record<
    string,
    {
      roomId: string;
      updatedAt: string;
      state: RoomState;
      reviewPassCount: number;
      validationState: { qualityBonus: number; finalPass: boolean };
    }
  >;
}): DerivedProgressionState {
  const totalRooms = input.dungeonRooms.length;
  const creatorMappedRooms = input.dungeonRooms.filter((room) => room.status !== "Uncreated").length;

  const clearedRoomMetadata = input.dungeonRooms
    .map((roomSummary) => input.rooms[roomSummary.roomId])
    .filter((room): room is NonNullable<typeof room> => Boolean(room))
    .filter((room) => isClearedRoomState(room.state) && room.validationState.finalPass)
    .sort((left, right) => {
      if (left.updatedAt === right.updatedAt) {
        return left.roomId.localeCompare(right.roomId);
      }
      return left.updatedAt.localeCompare(right.updatedAt);
    });

  const reviewPassCount = Object.values(input.rooms).reduce(
    (total, room) => total + Math.max(0, Math.trunc(room.reviewPassCount)),
    0,
  );
  const fullReviewPasses =
    totalRooms > 0 ? Math.trunc(reviewPassCount / totalRooms) : 0;

  let replayXpTotal = 0;
  let replayRank: RankTier = assignRankTier(0);
  let replayBadges: string[] = [];
  let rewardHistory = [] as SubjectProgressionSummary["rewardHistory"];
  const rewardBreakdowns: PostRoomClearBreakdownPayload[] = [];

  for (let index = 0; index < clearedRoomMetadata.length; index += 1) {
    const room = clearedRoomMetadata[index];
    if (!room) {
      continue;
    }

    const progressionAward = awardRoomClearProgression({
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

    if (!progressionAward.ok) {
      continue;
    }

    const payload = buildPostRoomClearBreakdownPayload({
      subjectId: input.subjectId,
      roomId: room.roomId,
      occurredAt: room.updatedAt,
      xpBreakdown: progressionAward.value.xpBreakdown,
      xpTotalBefore: progressionAward.value.xpTotalBefore,
      xpTotalAfter: progressionAward.value.xpTotalAfter,
      rankBefore: progressionAward.value.rankBefore,
      rankAfter: progressionAward.value.rankAfter,
      streakCount: index + 1,
      unlockedBadges: progressionAward.value.unlockedBadges,
    });

    rewardBreakdowns.push(payload);

    const newEntries = createRoomClearRewardHistoryEntries({
      subjectId: input.subjectId,
      roomId: room.roomId,
      occurredAt: room.updatedAt,
      xpBreakdown: progressionAward.value.xpBreakdown,
      xpTotalBefore: progressionAward.value.xpTotalBefore,
      xpTotalAfter: progressionAward.value.xpTotalAfter,
      rankBefore: progressionAward.value.rankBefore,
      rankAfter: progressionAward.value.rankAfter,
      unlockedBadges: progressionAward.value.unlockedBadges,
    });
    rewardHistory = appendRewardHistory(rewardHistory, newEntries);

    replayXpTotal = progressionAward.value.xpTotalAfter;
    replayRank = progressionAward.value.rankAfter;
    replayBadges = [...progressionAward.value.progressionSnapshot.badges];
  }

  const persistedRank = isRankTier(input.progression.rank)
    ? input.progression.rank
    : assignRankTier(input.progression.xpTotal);

  const summary = buildSubjectProgressionSummary({
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    xpTotal: input.progression.xpTotal,
    rank: persistedRank,
    badges: input.progression.badges,
    rewardHistory,
    completion: {
      totalRooms,
      creatorMappedRooms,
      scribeClearedRooms: clearedRoomMetadata.length,
    },
    reviewAnalytics: {
      reviewSessionCount: reviewPassCount,
      fullReviewPasses,
      currentReviewStreak: Math.min(fullReviewPasses, 1),
      longestReviewStreak: fullReviewPasses,
    },
  });

  if (summary.rewardHistory.length === 0 && replayXpTotal > 0) {
    summary.rewardHistory = [
      {
        eventId: `${input.subjectId}:replay:xp-total`,
        subjectId: input.subjectId,
        occurredAt: new Date().toISOString(),
        eventType: "ROOM_CLEAR_XP_AWARDED",
        xpDelta: replayXpTotal,
        xpTotalAfter: replayXpTotal,
        rankAfter: replayRank,
      },
    ];
  }

  return {
    summary,
    rewardBreakdowns,
    replayXpTotal,
  };
}

export function ProgressionScreen(): JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(DEFAULT_WORKSPACE_ROOT);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [activeSubjectId, setActiveSubjectId] = useState<string>("");
  const [progressionState, setProgressionState] = useState<DerivedProgressionState | null>(null);
  const [selectedBreakdownRoomId, setSelectedBreakdownRoomId] = useState<string>("");
  const [exportDestinationPath, setExportDestinationPath] = useState<string>("");

  const [warning, setWarning] = useState<ActionableWarning | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadSubjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const subjectIds = await FileStore.listSubjects(workspaceRoot);
      setSubjects(subjectIds);
      if (!selectedSubjectId && subjectIds[0]) {
        setSelectedSubjectId(subjectIds[0]);
      }
      setWarning(null);
    } catch (error) {
      setWarning(buildActionableWarning(error, "Could not list workspace subjects"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubjectId, workspaceRoot]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const openSubject = useCallback(async () => {
    const subjectId = selectedSubjectId.trim();
    if (!subjectId) {
      setWarning({
        title: "No subject selected",
        message: "Select a subject to load progression details.",
        remediation: "Choose an existing subject ID and retry open.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const fileStore = new FileStore({ workspaceRoot, subjectId });
      const loaded = await fileStore.loadDungeon();

      const derived = deriveProgressionState({
        subjectId,
        subjectName: loaded.dungeon.subjectName,
        progression: loaded.dungeon.progression,
        dungeonRooms: loaded.dungeon.rooms,
        rooms: loaded.rooms,
      });

      const latestBreakdown = derived.rewardBreakdowns[derived.rewardBreakdowns.length - 1];
      setProgressionState(derived);
      setActiveSubjectId(subjectId);
      setSelectedBreakdownRoomId(latestBreakdown ? latestBreakdown.roomId : "");
      setExportDestinationPath(
        `${workspaceRoot}/progress-exports/${subjectId}-progress-summary.csv`,
      );
      setStatusMessage(
        `Loaded ${subjectId} progression with ${derived.summary.rewardHistory.length} reward event(s).`,
      );
      setWarning(null);
    } catch (error) {
      setWarning(buildActionableWarning(error, "Could not open selected subject"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubjectId, workspaceRoot]);

  const exportSummaryCsv = useCallback(async () => {
    if (!progressionState || !activeSubjectId) {
      setWarning({
        title: "No active subject",
        message: "Open a subject before exporting progression metrics.",
        remediation: "Load a subject and retry CSV export.",
      });
      return;
    }

    if (!exportDestinationPath.trim()) {
      setWarning({
        title: "Export path required",
        message: "A destination CSV path is required.",
        remediation: "Provide a valid file path, then retry export.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const writtenPath = await writeProgressSummaryCsv({
        destinationFilePath: exportDestinationPath.trim(),
        summaries: [progressionState.summary],
      });
      setStatusMessage(`Progress CSV exported for ${activeSubjectId}: ${writtenPath}`);
      setWarning(null);
    } catch (error) {
      setWarning(buildActionableWarning(error, "Could not export progression CSV"));
    } finally {
      setIsLoading(false);
    }
  }, [activeSubjectId, exportDestinationPath, progressionState]);

  const activeBreakdown = useMemo(() => {
    if (!progressionState) {
      return null;
    }

    if (selectedBreakdownRoomId) {
      const selected = progressionState.rewardBreakdowns.find(
        (breakdown) => breakdown.roomId === selectedBreakdownRoomId,
      );
      if (selected) {
        return selected;
      }
    }

    return progressionState.rewardBreakdowns[progressionState.rewardBreakdowns.length - 1] ?? null;
  }, [progressionState, selectedBreakdownRoomId]);

  const badgeStates = useMemo(() => {
    const summary = progressionState?.summary;
    return BADGE_IDS.map((badgeId) => {
      const unlocked = summary ? summary.badges.includes(badgeId) : false;
      const unlockedAt = summary?.badgeUnlockTimestamps[badgeId];
      return { badgeId, unlocked, unlockedAt };
    });
  }, [progressionState]);

  return (
    <div className="progression-shell">
      <header className="progression-header" aria-live="polite">
        <h1>Progression</h1>
        <p>
          Track XP totals, rank tiers, badge unlocks, and local reward history. Export
          subject progress metrics to CSV for offline review.
        </p>
      </header>

      <main className="progression-grid" aria-label="Progression dashboard workspace">
        <section className="progression-card" aria-labelledby="progression-load-heading">
          <h2 id="progression-load-heading">Load Subject Progression</h2>
          <div className="field-grid" role="group" aria-label="Select and open progression subject">
            <label htmlFor="progression-workspace-root">Workspace root</label>
            <input
              id="progression-workspace-root"
              value={workspaceRoot}
              onChange={(event) => setWorkspaceRoot(event.target.value)}
              placeholder="/path/to/workspace"
            />

            <button type="button" onClick={() => void loadSubjects()} disabled={isLoading}>
              Refresh Subject List
            </button>

            <label htmlFor="progression-subject-id">Existing subject ID</label>
            <select
              id="progression-subject-id"
              value={selectedSubjectId}
              onChange={(event) => setSelectedSubjectId(event.target.value)}
            >
              <option value="">Select a subject</option>
              {subjects.map((subjectId) => (
                <option key={subjectId} value={subjectId}>
                  {subjectId}
                </option>
              ))}
            </select>

            <button type="button" onClick={() => void openSubject()} disabled={isLoading}>
              Open Subject in Progression
            </button>
          </div>

          <p className="status-text">Active subject: {activeSubjectId || "None"}</p>
        </section>

        <section className="progression-card" aria-labelledby="progression-dashboard-heading">
          <h2 id="progression-dashboard-heading">Subject Dashboard</h2>
          {progressionState ? (
            <>
              <div className="progression-dashboard-grid" role="group" aria-label="Progression summary metrics">
                <div className="progression-metric-panel">
                  <h3>XP Total</h3>
                  <p>{progressionState.summary.xpTotal}</p>
                  <span>Replayed room-clear XP: {progressionState.replayXpTotal}</span>
                </div>
                <div className="progression-metric-panel">
                  <h3>Rank Tier</h3>
                  <p>{progressionState.summary.rank}</p>
                  <span>Reward events: {progressionState.summary.rewardHistory.length}</span>
                </div>
                <div className="progression-metric-panel">
                  <h3>Badge State</h3>
                  <p>
                    {progressionState.summary.badges.length}/{BADGE_IDS.length}
                  </p>
                  <span>Unlocked badges</span>
                </div>
              </div>

              <ul className="progression-badge-list" aria-label="Phase completion badges">
                {badgeStates.map((badge) => (
                  <li key={badge.badgeId}>
                    <strong>{badge.badgeId}</strong>
                    <span>{badge.unlocked ? "Unlocked" : "Locked"}</span>
                    <span>{badge.unlockedAt ? formatDateTime(badge.unlockedAt) : "Not yet unlocked"}</span>
                  </li>
                ))}
              </ul>

              <div className="progression-ratio-grid" aria-label="Completion ratios">
                <p>
                  Creator mapped rooms: {progressionState.summary.metrics.creatorMappedRooms}/
                  {progressionState.summary.metrics.totalRooms} (
                  {toPercentText(progressionState.summary.metrics.creatorCompletionRatio)})
                </p>
                <p>
                  Scribe cleared rooms: {progressionState.summary.metrics.scribeClearedRooms}/
                  {progressionState.summary.metrics.totalRooms} (
                  {toPercentText(progressionState.summary.metrics.scribeCompletionRatio)})
                </p>
              </div>
            </>
          ) : (
            <p className="helper-text">Open a subject to view XP, rank tier, and badge state.</p>
          )}
        </section>

        <section className="progression-card" aria-labelledby="progression-breakdown-heading">
          <h2 id="progression-breakdown-heading">Reward Breakdown After Room Clear</h2>
          {progressionState && progressionState.rewardBreakdowns.length > 0 ? (
            <>
              <div className="field-grid" role="group" aria-label="Select a cleared room reward breakdown">
                <label htmlFor="progression-breakdown-room">Cleared room</label>
                <select
                  id="progression-breakdown-room"
                  value={selectedBreakdownRoomId}
                  onChange={(event) => setSelectedBreakdownRoomId(event.target.value)}
                >
                  {progressionState.rewardBreakdowns.map((payload) => (
                    <option key={`${payload.roomId}:${payload.occurredAt}`} value={payload.roomId}>
                      {payload.roomId} ({formatDateTime(payload.occurredAt)})
                    </option>
                  ))}
                </select>
              </div>

              {activeBreakdown ? (
                <div className="progression-breakdown-surface" aria-live="polite">
                  <p>
                    Room {activeBreakdown.roomId} cleared at {formatDateTime(activeBreakdown.occurredAt)}
                  </p>
                  <p>
                    XP: {activeBreakdown.xpBreakdown.baseXp} base + {activeBreakdown.xpBreakdown.qualityBonus} quality + {activeBreakdown.xpBreakdown.streakBonus} streak = {activeBreakdown.xpBreakdown.totalDelta}
                  </p>
                  <p>
                    Total XP: {activeBreakdown.xpTotalBefore} to {activeBreakdown.xpTotalAfter}
                  </p>
                  <p>
                    Rank: {activeBreakdown.rankBefore} to {activeBreakdown.rankAfter}
                  </p>
                  <p>
                    Unlocked badges: {activeBreakdown.unlockedBadges.length > 0
                      ? activeBreakdown.unlockedBadges.join(", ")
                      : "None"}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="helper-text">
              No cleared-room rewards yet. Clear encounters in Scribe to populate deterministic breakdowns.
            </p>
          )}
        </section>

        <section className="progression-card" aria-labelledby="progression-history-heading">
          <h2 id="progression-history-heading">Reward History Timeline</h2>
          {progressionState && progressionState.summary.rewardHistory.length > 0 ? (
            <ol className="progression-timeline" aria-label="Reward history events">
              {progressionState.summary.rewardHistory.map((entry) => (
                <li key={entry.eventId}>
                  <div>
                    <strong>{entry.eventType}</strong>
                    <span>{formatDateTime(entry.occurredAt)}</span>
                  </div>
                  <p>
                    XP delta: {entry.xpDelta} | XP total: {entry.xpTotalAfter} | Rank: {entry.rankAfter}
                  </p>
                  {entry.badgeId ? <p>Badge: {entry.badgeId}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-text">No reward history events available for the active subject.</p>
          )}
        </section>

        <section className="progression-card" aria-labelledby="progression-export-heading">
          <h2 id="progression-export-heading">Local CSV Export</h2>
          <div className="field-grid" role="group" aria-label="Export progression metrics locally">
            <label htmlFor="progression-export-path">Destination CSV path</label>
            <input
              id="progression-export-path"
              value={exportDestinationPath}
              onChange={(event) => setExportDestinationPath(event.target.value)}
              placeholder="./progress-exports/subject-progress-summary.csv"
            />

            <button type="button" onClick={() => void exportSummaryCsv()} disabled={isLoading}>
              Export Progress CSV
            </button>
          </div>
        </section>
      </main>

      {warning ? (
        <aside className="warning-surface" role="alert">
          <h2>{warning.title}</h2>
          <p>{warning.message}</p>
          <p>{warning.remediation}</p>
          {warning.code ? <p>Error code: {warning.code}</p> : null}
        </aside>
      ) : null}

      {statusMessage ? (
        <aside className="status-surface" role="status" aria-live="polite">
          <p>{statusMessage}</p>
        </aside>
      ) : null}
    </div>
  );
}