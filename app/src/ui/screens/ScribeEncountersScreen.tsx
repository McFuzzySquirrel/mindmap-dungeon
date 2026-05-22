import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import { NOTE_MINIMUM_WORD_COUNT, REQUIRED_NOTE_SECTIONS } from "@core/validation/notes";
import {
  createFileStoreScribePersistence,
  createScribeOrchestrator,
  type ScribeDomainError,
  type ScribeEncounterSummary,
  type ScribeOrchestrator,
  type ScribeState,
  type ScribeSubmissionOutcome,
} from "@features/scribe";
import { FileStore } from "@services/fileStore";

import { buildActionableWarning } from "./foundationWarnings";

interface ScreenWarning {
  title: string;
  message: string;
  remediation: string;
  code?: string;
}

const DEFAULT_WORKSPACE_ROOT = ".";
const DEFAULT_NOTE_TEMPLATE = REQUIRED_NOTE_SECTIONS.map((section) => `## ${section}\n`).join("\n");

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function toDomainWarning(error: ScribeDomainError): ScreenWarning {
  return {
    title: "Scribe operation blocked",
    message: error.message,
    remediation: "Review the active subject and room selection, then retry.",
    code: error.code,
  };
}

function parseReferenceTerms(rawText: string): string[] {
  return Array.from(
    new Set(
      rawText
        .split(/\n|,/)
        .map((term) => term.trim())
        .filter((term) => term.length > 0),
    ),
  );
}

function formatCriterionValue(value: number | boolean | readonly string[]): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return value.length === 0 ? "None" : value.join(", ");
}

export function ScribeEncountersScreen(): JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(DEFAULT_WORKSPACE_ROOT);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [activeSubjectId, setActiveSubjectId] = useState<string>("");

  const [fileStore, setFileStore] = useState<FileStore | null>(null);
  const [scribeOrchestrator, setScribeOrchestrator] = useState<ScribeOrchestrator | null>(null);
  const [scribeState, setScribeState] = useState<ScribeState | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [noteDraft, setNoteDraft] = useState<string>(DEFAULT_NOTE_TEMPLATE);
  const [manualConfirmed, setManualConfirmed] = useState<boolean>(false);
  const [referenceTermsText, setReferenceTermsText] = useState<string>("");
  const [regenerateArtifactOnRevision, setRegenerateArtifactOnRevision] =
    useState<boolean>(false);

  const [lastOutcome, setLastOutcome] = useState<ScribeSubmissionOutcome | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [warning, setWarning] = useState<ScreenWarning | null>(null);
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
      const actionableWarning = buildActionableWarning(error, "Could not list workspace subjects");
      setWarning({
        title: actionableWarning.title,
        message: actionableWarning.message,
        remediation: actionableWarning.remediation,
        ...(actionableWarning.code ? { code: actionableWarning.code } : {}),
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubjectId, workspaceRoot]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const loadRoomDraft = useCallback(async (activeFileStore: FileStore, roomId: string) => {
    try {
      const loadedNote = await activeFileStore.readRoomNote(roomId);
      setNoteDraft(loadedNote.trim().length > 0 ? loadedNote : DEFAULT_NOTE_TEMPLATE);
    } catch (error) {
      if (!isNotFoundError(error)) {
        const actionableWarning = buildActionableWarning(error, "Could not load room note draft");
        setWarning({
          title: actionableWarning.title,
          message: actionableWarning.message,
          remediation: actionableWarning.remediation,
          ...(actionableWarning.code ? { code: actionableWarning.code } : {}),
        });
      }
      setNoteDraft(DEFAULT_NOTE_TEMPLATE);
    }
  }, []);

  const encounters = useMemo(() => {
    if (!scribeState) {
      return [];
    }

    return Object.values(scribeState.encountersByRoomId).sort((left, right) =>
      left.roomId.localeCompare(right.roomId),
    );
  }, [scribeState]);

  const activeEncounter = useMemo<ScribeEncounterSummary | null>(() => {
    if (!selectedRoomId || !scribeState) {
      return null;
    }

    return scribeState.encountersByRoomId[selectedRoomId] ?? null;
  }, [scribeState, selectedRoomId]);

  const activeRoom = useMemo(() => {
    if (!selectedRoomId || !scribeState) {
      return null;
    }

    return scribeState.rooms[selectedRoomId] ?? null;
  }, [scribeState, selectedRoomId]);

  const openSubject = useCallback(async () => {
    const subjectId = selectedSubjectId.trim();
    if (!subjectId) {
      setWarning({
        title: "No subject selected",
        message: "Select a subject to load Scribe encounters.",
        remediation: "Choose an existing subject ID, then retry open.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const nextFileStore = new FileStore({ workspaceRoot, subjectId });
      const loadedSubject = await nextFileStore.loadDungeon();
      const nextOrchestrator = createScribeOrchestrator({
        persistence: createFileStoreScribePersistence(nextFileStore),
      });

      const initialized = nextOrchestrator.initialize({
        loadedSubject,
        nowIso: new Date().toISOString(),
      });

      if (!initialized.ok) {
        setWarning(toDomainWarning(initialized.error));
        return;
      }

      const firstRoomId = initialized.value.dungeon.rooms[0]?.roomId ?? "";

      setFileStore(nextFileStore);
      setScribeOrchestrator(nextOrchestrator);
      setScribeState(initialized.value);
      setSelectedRoomId(firstRoomId);
      setActiveSubjectId(subjectId);
      setLastOutcome(null);
      setReferenceTermsText("");
      setRegenerateArtifactOnRevision(false);

      if (firstRoomId) {
        const firstRoom = initialized.value.rooms[firstRoomId];
        setManualConfirmed(firstRoom ? firstRoom.validationState.manualConfirmed : false);
        await loadRoomDraft(nextFileStore, firstRoomId);
      }

      setStatusMessage(
        `Loaded ${subjectId} with ${initialized.value.dungeon.rooms.length} encounter room(s).`,
      );
      setWarning(null);
    } catch (error) {
      const actionableWarning = buildActionableWarning(error, "Could not open selected subject");
      setWarning({
        title: actionableWarning.title,
        message: actionableWarning.message,
        remediation: actionableWarning.remediation,
        ...(actionableWarning.code ? { code: actionableWarning.code } : {}),
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadRoomDraft, selectedSubjectId, workspaceRoot]);

  const selectRoom = useCallback(
    async (roomId: string) => {
      if (!fileStore || !scribeState) {
        return;
      }

      setSelectedRoomId(roomId);
      const room = scribeState.rooms[roomId];
      setManualConfirmed(room ? room.validationState.manualConfirmed : false);
      await loadRoomDraft(fileStore, roomId);
    },
    [fileStore, loadRoomDraft, scribeState],
  );

  const runSubmission = useCallback(
    async (mode: "submit" | "revise") => {
      if (!scribeOrchestrator || !activeRoom) {
        return;
      }

      const referenceTerms = parseReferenceTerms(referenceTermsText);
      setIsLoading(true);
      try {
        const commonInput = {
          roomId: activeRoom.roomId,
          noteText: noteDraft,
          manualConfirmed,
          nowIso: new Date().toISOString(),
          ...(referenceTerms.length > 0 ? { referenceTerms } : {}),
        };

        const result =
          mode === "submit"
            ? await scribeOrchestrator.submitEncounterNote(commonInput)
            : await scribeOrchestrator.reviseClearedNote({
                ...commonInput,
                regenerateArtifact: regenerateArtifactOnRevision,
              });

        if (!result.ok) {
          setWarning(toDomainWarning(result.error));
          return;
        }

        setLastOutcome(result.value);

        const refreshed = await scribeOrchestrator.refresh();
        if (refreshed.ok) {
          setScribeState(refreshed.value);
        }

        if (!result.value.validation.finalPass) {
          setStatusMessage("Encounter failed validation. Draft has been preserved for retry.");
        } else if (result.value.artifact) {
          setStatusMessage(
            `Encounter cleared. Artifact ${result.value.artifact.metadata.artifactId} generated.`,
          );
        } else {
          setStatusMessage(
            "Validation passed. Existing completion and artifact state were preserved.",
          );
        }

        setWarning(null);
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeRoom,
      manualConfirmed,
      noteDraft,
      referenceTermsText,
      regenerateArtifactOnRevision,
      scribeOrchestrator,
    ],
  );

  return (
    <div className="scribe-shell">
      <header className="scribe-header" aria-live="polite">
        <h1>Scribe Encounters</h1>
        <p>
          Defeat room encounters by drafting structured notes, confirming manually, and
          iterating on validation feedback without losing your draft.
        </p>
      </header>

      <main className="scribe-grid" aria-label="Scribe encounters workspace">
        <section className="scribe-card" aria-labelledby="scribe-subject-heading">
          <h2 id="scribe-subject-heading">Load Subject</h2>
          <div className="field-grid" role="group" aria-label="Open subject for Scribe phase">
            <label htmlFor="scribe-workspace-root">Workspace root</label>
            <input
              id="scribe-workspace-root"
              value={workspaceRoot}
              onChange={(event) => setWorkspaceRoot(event.target.value)}
              placeholder="/path/to/workspace"
            />

            <button type="button" onClick={() => void loadSubjects()} disabled={isLoading}>
              Refresh Subject List
            </button>

            <label htmlFor="scribe-subject-select">Subject ID</label>
            <select
              id="scribe-subject-select"
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
              Open Subject in Scribe
            </button>

            <p className="status-text">Active subject: {activeSubjectId || "None"}</p>
          </div>
        </section>

        <section className="scribe-card" aria-labelledby="scribe-encounters-heading">
          <h2 id="scribe-encounters-heading">Encounter Status</h2>
          {encounters.length > 0 ? (
            <ul className="scribe-room-list" aria-label="Room encounter status list">
              {encounters.map((encounter) => {
                const isSelected = encounter.roomId === selectedRoomId;
                return (
                  <li key={encounter.roomId} className={isSelected ? "is-selected" : ""}>
                    <div>
                      <strong>{encounter.topic}</strong>
                      <p>
                        Room: {encounter.roomId} | State: {encounter.roomState} | Cleared:{" "}
                        {encounter.isCleared ? "Yes" : "No"}
                      </p>
                      <p>
                        Draft present: {encounter.hasDraft ? "Yes" : "No"}
                        {encounter.latestFailedChecks.length > 0
                          ? ` | Unmet checks: ${encounter.latestFailedChecks.join(", ")}`
                          : " | Unmet checks: None"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void selectRoom(encounter.roomId)}
                      disabled={isLoading}
                      aria-label={`Edit encounter note for room ${encounter.roomId}`}
                    >
                      Edit Note
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="helper-text">Open a subject to load room encounters.</p>
          )}
        </section>

        <section className="scribe-card" aria-labelledby="scribe-editor-heading">
          <h2 id="scribe-editor-heading">Note Editor and Validation Gate</h2>
          {activeRoom && activeEncounter ? (
            <>
              <div className="scribe-requirements" aria-live="polite">
                <h3>Encounter Requirements</h3>
                <p>
                  Topic: <strong>{activeEncounter.topic}</strong>
                </p>
                <p>
                  Minimum words: {NOTE_MINIMUM_WORD_COUNT} | Manual confirmation: required | Current
                  status: {activeEncounter.roomState}
                </p>
                <p>Required sections:</p>
                <ul className="creator-tag-list" aria-label="Required note sections">
                  {REQUIRED_NOTE_SECTIONS.map((section) => (
                    <li key={section}>{section}</li>
                  ))}
                </ul>
              </div>

              <div className="field-grid" role="group" aria-label="Scribe note editor">
                <label htmlFor="scribe-note-editor">Encounter note</label>
                <textarea
                  id="scribe-note-editor"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  rows={14}
                  placeholder={DEFAULT_NOTE_TEMPLATE}
                />

                <label htmlFor="scribe-reference-terms">Reference terms (optional, comma/newline separated)</label>
                <textarea
                  id="scribe-reference-terms"
                  value={referenceTermsText}
                  onChange={(event) => setReferenceTermsText(event.target.value)}
                  rows={3}
                  placeholder="mitosis, chromosome, replication"
                />

                <label className="checkbox-row" htmlFor="scribe-manual-confirm">
                  <input
                    id="scribe-manual-confirm"
                    type="checkbox"
                    checked={manualConfirmed}
                    onChange={(event) => setManualConfirmed(event.target.checked)}
                  />
                  I confirm this note reflects my own review and is ready for validation.
                </label>

                {activeEncounter.isCleared ? (
                  <>
                    <label className="checkbox-row" htmlFor="scribe-regenerate-artifact">
                      <input
                        id="scribe-regenerate-artifact"
                        type="checkbox"
                        checked={regenerateArtifactOnRevision}
                        onChange={(event) => setRegenerateArtifactOnRevision(event.target.checked)}
                      />
                      Regenerate artifact from revised note.
                    </label>

                    <button
                      type="button"
                      onClick={() => void runSubmission("revise")}
                      disabled={isLoading}
                    >
                      Save Revision for Cleared Room
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void runSubmission("submit")}
                    disabled={isLoading}
                  >
                    Submit Encounter Note
                  </button>
                )}
              </div>

              {lastOutcome && lastOutcome.room.roomId === activeRoom.roomId ? (
                <div className={lastOutcome.validation.finalPass ? "status-surface" : "warning-surface"}>
                  <h3>{lastOutcome.validation.finalPass ? "Validation Passed" : "Validation Failed"}</h3>
                  <p>
                    Word count: {lastOutcome.validation.wordCount} | Quality bonus:{" "}
                    {lastOutcome.validation.qualityBonus}
                  </p>

                  {lastOutcome.validation.finalPass ? (
                    <p>
                      Room completion changed: {lastOutcome.completionChanged ? "Yes" : "No"} | Reward
                      eligible: {lastOutcome.rewardEligible ? "Yes" : "No"}
                    </p>
                  ) : null}

                  {!lastOutcome.validation.finalPass ? (
                    <ul className="scribe-feedback-list" aria-label="Unmet validation criteria">
                      {lastOutcome.validation.criteria
                        .filter((criterion) => !criterion.passed)
                        .map((criterion) => (
                          <li key={criterion.code}>
                            <strong>{criterion.code}</strong>: {criterion.message} Required: {" "}
                            {formatCriterionValue(criterion.required)} | Actual:{" "}
                            {formatCriterionValue(criterion.actual)}
                          </li>
                        ))}
                    </ul>
                  ) : null}

                  {lastOutcome.artifact ? (
                    <p>
                      Artifact generated: {lastOutcome.artifact.metadata.artifactId} at{" "}
                      {new Date(lastOutcome.artifact.metadata.generatedAtIso).toLocaleString()}.
                    </p>
                  ) : lastOutcome.validation.finalPass ? (
                    <p>
                      Artifact generation unchanged for this submission (idempotent completion path).
                    </p>
                  ) : null}

                  <h4>Rubric Breakdown</h4>
                  <ul className="scribe-feedback-list" aria-label="Quality rubric breakdown">
                    {lastOutcome.validation.rubric.map((entry) => (
                      <li key={entry.criterion}>
                        {entry.criterion}: {entry.score}/2 - {entry.rationale}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="helper-text">
                  Submit to view pass/fail feedback, unmet checks, and artifact generation details.
                </p>
              )}
            </>
          ) : (
            <p className="helper-text">Select a room encounter to start editing notes.</p>
          )}
        </section>

        <section className="scribe-card" aria-labelledby="scribe-status-heading">
          <h2 id="scribe-status-heading">Status and Recovery</h2>
          {warning ? (
            <div className="warning-surface" role="alert" aria-live="assertive">
              <h3>{warning.title}</h3>
              <p>{warning.message}</p>
              <p>
                <strong>Action:</strong> {warning.remediation}
              </p>
              {warning.code ? (
                <p>
                  <strong>Error code:</strong> {warning.code}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="status-text">No active warnings.</p>
          )}

          <div className="status-surface" aria-live="polite">
            <h3>Recent status</h3>
            <p>{statusMessage || "No recent actions."}</p>
          </div>

          <p className="helper-text">
            Draft notes are saved before validation checks run, so failed submissions can be
            retried without losing your edits.
          </p>
        </section>
      </main>
    </div>
  );
}