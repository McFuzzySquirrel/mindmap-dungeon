import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  createArchaeologistOrchestrator,
  createFileStoreArchaeologistPersistence,
  type ArchaeologistDomainError,
  type ArchaeologistOrchestrator,
  type ArchaeologistState,
} from "@features/archaeologist";
import type { ArtifactPresentationContract } from "@core/review";
import { FileStore } from "@services/fileStore";

import { buildActionableWarning } from "./foundationWarnings";

const DEFAULT_WORKSPACE_ROOT = ".";

interface InlineSegment {
  text: string;
  href?: string;
}

interface ScreenWarning {
  title: string;
  message: string;
  remediation: string;
  code?: string;
  backupGuidance?: string;
}

function toPercentText(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function normalizeRelativePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/^\/+/, "");
}

function buildAttachmentAbsolutePath(input: {
  workspaceRoot: string;
  subjectId: string;
  roomId: string;
  relativePath: string;
}): string {
  const root = input.workspaceRoot.replace(/\/+$/, "");
  const normalizedRelativePath = normalizeRelativePath(input.relativePath);

  return [root, "dungeon-data", input.subjectId, "rooms", input.roomId, normalizedRelativePath]
    .filter((part) => part.length > 0)
    .join("/");
}

function toFileUri(absolutePath: string): string | null {
  if (!absolutePath.startsWith("/")) {
    return null;
  }

  return `file://${encodeURI(absolutePath)}`;
}

function parseInlineSegments(line: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  let cursor = 0;
  let match = markdownLinkPattern.exec(line);
  while (match) {
    const fullMatch = match[0] ?? "";
    const label = match[1] ?? "";
    const href = match[2] ?? "";
    const start = match.index;

    if (start > cursor) {
      segments.push({ text: line.slice(cursor, start) });
    }

    segments.push({ text: label, href });
    cursor = start + fullMatch.length;
    match = markdownLinkPattern.exec(line);
  }

  if (cursor < line.length) {
    segments.push({ text: line.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text: line }];
}

function toDomainWarning(error: ArchaeologistDomainError): ScreenWarning {
  const remediation =
    error.code === "REVIEW_LOCKED"
      ? "Clear all Scribe encounters before starting review mode."
      : "Confirm room selection and subject state, then retry.";

  return {
    title: "Archaeologist operation blocked",
    message: error.message,
    remediation,
    code: error.code,
  };
}

function renderInlineMarkdown(input: {
  line: string;
  artifact: ArtifactPresentationContract;
  workspaceRoot: string;
  subjectId: string;
  roomId: string;
}): Array<JSX.Element | string> {
  const segments = parseInlineSegments(input.line);

  return segments.map((segment, index) => {
    if (!segment.href) {
      return segment.text;
    }

    const matchingLink = input.artifact.linkReferences.find(
      (link) => link.href === segment.href && link.label === segment.text,
    );

    if (!matchingLink) {
      return segment.text;
    }

    if (!matchingLink.isLocal) {
      return (
        <a
          key={`${matchingLink.href}:${index}`}
          href={matchingLink.href}
          target="_blank"
          rel="noreferrer"
        >
          {segment.text}
        </a>
      );
    }

    if (!matchingLink.isResolved || !matchingLink.attachmentId) {
      return (
        <span key={`${matchingLink.href}:${index}`} className="archaeologist-link-unresolved">
          {segment.text} (missing local link)
        </span>
      );
    }

    const attachment = input.artifact.attachments.find(
      (entry) => entry.attachmentId === matchingLink.attachmentId,
    );

    if (!attachment) {
      return (
        <span key={`${matchingLink.href}:${index}`} className="archaeologist-link-unresolved">
          {segment.text} (missing attachment metadata)
        </span>
      );
    }

    const path = buildAttachmentAbsolutePath({
      workspaceRoot: input.workspaceRoot,
      subjectId: input.subjectId,
      roomId: input.roomId,
      relativePath: attachment.relativePath,
    });
    const fileUri = toFileUri(path);

    if (!fileUri) {
      return (
        <span key={`${matchingLink.href}:${index}`}>
          {segment.text} ({attachment.relativePath})
        </span>
      );
    }

    return (
      <a key={`${matchingLink.href}:${index}`} href={fileUri} target="_blank" rel="noreferrer">
        {segment.text}
      </a>
    );
  });
}

function renderArtifactMarkdown(input: {
  artifact: ArtifactPresentationContract;
  workspaceRoot: string;
  subjectId: string;
  roomId: string;
}): JSX.Element[] {
  const lines = input.artifact.markdown.split(/\r?\n/);
  const blocks: JSX.Element[] = [];

  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const rawLine = lines[lineIndex] ?? "";
    const line = rawLine.trimEnd();

    if (line.trim().length === 0) {
      lineIndex += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      const headingDepth = Math.min(6, headingMatch[1]?.length ?? 1);
      const headingText = headingMatch[2] ?? "";
      const headingKey = `heading-${lineIndex}`;

      if (headingDepth === 1) {
        blocks.push(
          <h3 key={headingKey}>
            {renderInlineMarkdown({
              line: headingText,
              artifact: input.artifact,
              workspaceRoot: input.workspaceRoot,
              subjectId: input.subjectId,
              roomId: input.roomId,
            })}
          </h3>,
        );
      } else {
        blocks.push(
          <h4 key={headingKey}>
            {renderInlineMarkdown({
              line: headingText,
              artifact: input.artifact,
              workspaceRoot: input.workspaceRoot,
              subjectId: input.subjectId,
              roomId: input.roomId,
            })}
          </h4>,
        );
      }

      lineIndex += 1;
      continue;
    }

    if (/^-\s+/.test(line.trim())) {
      const items: string[] = [];
      const listStart = lineIndex;

      while (lineIndex < lines.length) {
        const candidate = (lines[lineIndex] ?? "").trim();
        if (!/^-\s+/.test(candidate)) {
          break;
        }
        items.push(candidate.replace(/^-\s+/, ""));
        lineIndex += 1;
      }

      blocks.push(
        <ul key={`list-${listStart}`}>
          {items.map((item, index) => (
            <li key={`list-${listStart}-${index}`}>
              {renderInlineMarkdown({
                line: item,
                artifact: input.artifact,
                workspaceRoot: input.workspaceRoot,
                subjectId: input.subjectId,
                roomId: input.roomId,
              })}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraphLines = [line.trim()];
    lineIndex += 1;
    while (lineIndex < lines.length) {
      const candidate = (lines[lineIndex] ?? "").trim();
      if (candidate.length === 0 || /^(#{1,6})\s+/.test(candidate) || /^-\s+/.test(candidate)) {
        break;
      }
      paragraphLines.push(candidate);
      lineIndex += 1;
    }

    blocks.push(
      <p key={`paragraph-${lineIndex}`}>
        {renderInlineMarkdown({
          line: paragraphLines.join(" "),
          artifact: input.artifact,
          workspaceRoot: input.workspaceRoot,
          subjectId: input.subjectId,
          roomId: input.roomId,
        })}
      </p>,
    );
  }

  return blocks;
}

export function ArchaeologistReviewScreen(): JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(DEFAULT_WORKSPACE_ROOT);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [activeSubjectId, setActiveSubjectId] = useState<string>("");

  const [orchestrator, setOrchestrator] = useState<ArchaeologistOrchestrator | null>(null);
  const [reviewState, setReviewState] = useState<ArchaeologistState | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [activeArtifact, setActiveArtifact] = useState<ArtifactPresentationContract | null>(null);
  const [activePromptText, setActivePromptText] = useState<string[]>([]);

  const [warning, setWarning] = useState<ScreenWarning | null>(null);
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
      const actionableWarning = buildActionableWarning(error, "Could not list workspace subjects");
      setWarning({
        title: actionableWarning.title,
        message: actionableWarning.message,
        remediation: actionableWarning.remediation,
        ...(actionableWarning.code ? { code: actionableWarning.code } : {}),
        ...(actionableWarning.backupGuidance
          ? { backupGuidance: actionableWarning.backupGuidance }
          : {}),
      });
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
        message: "Select a subject to load Archaeologist review mode.",
        remediation: "Choose an existing subject ID and retry open.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const fileStore = new FileStore({ workspaceRoot, subjectId });
      const loaded = await fileStore.loadDungeon();

      const nextOrchestrator = createArchaeologistOrchestrator({
        persistence: createFileStoreArchaeologistPersistence(fileStore),
      });

      const initialized = await nextOrchestrator.initialize({
        loadedSubject: loaded,
        nowIso: new Date().toISOString(),
      });

      if (!initialized.ok) {
        setWarning(toDomainWarning(initialized.error));
        return;
      }

      const firstRoomId = initialized.value.traversal.orderedRoomIds[0] ?? "";
      setOrchestrator(nextOrchestrator);
      setReviewState(initialized.value);
      setSelectedRoomId(firstRoomId);
      setActiveArtifact(null);
      setActivePromptText([]);
      setActiveSubjectId(subjectId);
      setStatusMessage(
        initialized.value.unlock.unlocked
          ? `Loaded ${subjectId}. Review mode unlocked with ${initialized.value.traversal.totalReviewableRooms} reviewable room(s).`
          : `Loaded ${subjectId}. Review mode locked at ${toPercentText(initialized.value.unlock.completionRatio)} completion.`,
      );
      setWarning(null);
    } catch (error) {
      const actionableWarning = buildActionableWarning(error, "Could not open selected subject");
      setWarning({
        title: actionableWarning.title,
        message: actionableWarning.message,
        remediation: actionableWarning.remediation,
        ...(actionableWarning.code ? { code: actionableWarning.code } : {}),
        ...(actionableWarning.backupGuidance
          ? { backupGuidance: actionableWarning.backupGuidance }
          : {}),
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubjectId, workspaceRoot]);

  const refreshReviewState = useCallback(async () => {
    if (!orchestrator) {
      return;
    }

    setIsLoading(true);
    try {
      const refreshed = await orchestrator.refresh(new Date().toISOString());
      if (!refreshed.ok) {
        setWarning(toDomainWarning(refreshed.error));
        return;
      }

      setReviewState(refreshed.value);
      if (selectedRoomId && !refreshed.value.traversal.roomsById[selectedRoomId]) {
        setSelectedRoomId(refreshed.value.traversal.orderedRoomIds[0] ?? "");
      }
      setStatusMessage("Refreshed Archaeologist review state.");
      setWarning(null);
    } catch (error) {
      const actionableWarning = buildActionableWarning(error, "Could not refresh Archaeologist state");
      setWarning({
        title: actionableWarning.title,
        message: actionableWarning.message,
        remediation: actionableWarning.remediation,
        ...(actionableWarning.code ? { code: actionableWarning.code } : {}),
        ...(actionableWarning.backupGuidance
          ? { backupGuidance: actionableWarning.backupGuidance }
          : {}),
      });
    } finally {
      setIsLoading(false);
    }
  }, [orchestrator, selectedRoomId]);

  const openSelectedArtifact = useCallback(async () => {
    if (!orchestrator || !selectedRoomId) {
      return;
    }

    setIsLoading(true);
    try {
      const reviewed = await orchestrator.reviewRoom({
        roomId: selectedRoomId,
        nowIso: new Date().toISOString(),
      });

      if (!reviewed.ok) {
        setWarning(toDomainWarning(reviewed.error));
        return;
      }

      setReviewState(reviewed.value.state);
      setActiveArtifact(reviewed.value.artifact);
      setActivePromptText(reviewed.value.prompts.map((prompt) => prompt.text));
      setStatusMessage(
        `Reviewed ${reviewed.value.room.topic}. Room review count is now ${reviewed.value.room.reviewPassCount}.`,
      );
      setWarning(null);
    } catch (error) {
      const actionableWarning = buildActionableWarning(error, "Could not open room artifact");
      setWarning({
        title: actionableWarning.title,
        message: actionableWarning.message,
        remediation: actionableWarning.remediation,
        ...(actionableWarning.code ? { code: actionableWarning.code } : {}),
        ...(actionableWarning.backupGuidance
          ? { backupGuidance: actionableWarning.backupGuidance }
          : {}),
      });
    } finally {
      setIsLoading(false);
    }
  }, [orchestrator, selectedRoomId]);

  const selectedTraversalRoom = useMemo(() => {
    if (!reviewState || !selectedRoomId) {
      return null;
    }

    return reviewState.traversal.roomsById[selectedRoomId] ?? null;
  }, [reviewState, selectedRoomId]);

  return (
    <div className="archaeologist-shell">
      <header className="archaeologist-header" aria-live="polite">
        <h1>Archaeologist Review</h1>
        <p>
          Revisit cleared rooms, read artifact markdown, and run deterministic self-check
          prompts before exams.
        </p>
      </header>

      <main className="archaeologist-grid" aria-label="Archaeologist review workspace">
        <section className="archaeologist-card" aria-labelledby="archaeologist-load-heading">
          <h2 id="archaeologist-load-heading">Load Subject for Review</h2>
          <div className="field-grid" role="group" aria-label="Open subject for Archaeologist review">
            <label htmlFor="archaeologist-workspace-root">Workspace root</label>
            <input
              id="archaeologist-workspace-root"
              value={workspaceRoot}
              onChange={(event) => setWorkspaceRoot(event.target.value)}
              placeholder="/path/to/workspace"
            />

            <button type="button" onClick={() => void loadSubjects()} disabled={isLoading}>
              Refresh Subject List
            </button>

            <label htmlFor="archaeologist-subject-id">Existing subject ID</label>
            <select
              id="archaeologist-subject-id"
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
              Open Subject in Archaeologist
            </button>

            <p className="status-text">Active subject: {activeSubjectId || "None"}</p>
          </div>
        </section>

        <section className="archaeologist-card" aria-labelledby="archaeologist-unlock-heading">
          <h2 id="archaeologist-unlock-heading">Review Unlock and Analytics</h2>
          {reviewState ? (
            <>
              <div className="archaeologist-unlock-surface" aria-live="polite">
                <p>
                  Review mode: <strong>{reviewState.unlock.unlocked ? "Unlocked" : "Locked"}</strong>
                </p>
                <p>
                  Completion: {reviewState.unlock.clearedRooms}/{reviewState.unlock.totalRooms} (
                  {toPercentText(reviewState.unlock.completionRatio)}) | Required: {toPercentText(reviewState.unlock.requiredCompletionRatio)}
                </p>
              </div>

              <div className="archaeologist-metric-grid" role="group" aria-label="Review analytics metrics">
                <div className="archaeologist-metric-panel">
                  <h3>Reviewed Rooms</h3>
                  <p>
                    {reviewState.analytics.reviewedRoomCount}/{reviewState.analytics.totalReviewableRooms}
                  </p>
                </div>
                <div className="archaeologist-metric-panel">
                  <h3>Review Count</h3>
                  <p>{reviewState.analytics.reviewSessionCount}</p>
                </div>
                <div className="archaeologist-metric-panel">
                  <h3>Full Passes</h3>
                  <p>{reviewState.analytics.fullReviewPasses}</p>
                </div>
                <div className="archaeologist-metric-panel">
                  <h3>Current Streak</h3>
                  <p>{reviewState.analytics.currentReviewStreak}</p>
                </div>
                <div className="archaeologist-metric-panel">
                  <h3>Longest Streak</h3>
                  <p>{reviewState.analytics.longestReviewStreak}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void refreshReviewState()}
                disabled={isLoading}
                aria-label="Refresh archaeologist unlock and analytics state"
              >
                Refresh Review State
              </button>
            </>
          ) : (
            <p className="helper-text">Open a subject to see Archaeologist unlock status and review analytics.</p>
          )}
        </section>

        <section className="archaeologist-card" aria-labelledby="archaeologist-traversal-heading">
          <h2 id="archaeologist-traversal-heading">Completed Room Traversal</h2>
          {reviewState && reviewState.traversal.orderedRoomIds.length > 0 ? (
            <>
              <div className="field-grid" role="group" aria-label="Select reviewable room">
                <label htmlFor="archaeologist-room-id">Reviewable room</label>
                <select
                  id="archaeologist-room-id"
                  value={selectedRoomId}
                  onChange={(event) => setSelectedRoomId(event.target.value)}
                >
                  {reviewState.traversal.orderedRoomIds.map((roomId) => {
                    const room = reviewState.traversal.roomsById[roomId];
                    if (!room) {
                      return null;
                    }

                    return (
                      <option key={room.roomId} value={room.roomId}>
                        {room.topic} ({room.roomId})
                      </option>
                    );
                  })}
                </select>

                <button
                  type="button"
                  onClick={() => void openSelectedArtifact()}
                  disabled={isLoading || !selectedRoomId}
                  aria-label={
                    selectedRoomId
                      ? `Open artifact and prompts for room ${selectedRoomId}`
                      : "Open selected room artifact"
                  }
                >
                  Open Room Artifact
                </button>
              </div>

              {selectedTraversalRoom ? (
                <div className="archaeologist-room-surface" aria-live="polite">
                  <p>
                    Topic: <strong>{selectedTraversalRoom.topic}</strong>
                  </p>
                  <p>
                    Room state: {selectedTraversalRoom.state} | Review count: {selectedTraversalRoom.reviewPassCount}
                  </p>
                  <p>Attachment count: {selectedTraversalRoom.attachmentCount}</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="helper-text">No reviewable rooms yet. Clear Scribe encounters first.</p>
          )}
        </section>

        <section className="archaeologist-card" aria-labelledby="archaeologist-artifact-heading">
          <h2 id="archaeologist-artifact-heading">Artifact Reader</h2>
          {activeArtifact && selectedRoomId ? (
            <>
              <article className="archaeologist-markdown" aria-label="Artifact markdown content">
                {renderArtifactMarkdown({
                  artifact: activeArtifact,
                  workspaceRoot,
                  subjectId: activeSubjectId,
                  roomId: selectedRoomId,
                })}
              </article>

              <div className="archaeologist-links" aria-label="Artifact links and attachments">
                <h3>Linked References</h3>
                <ul>
                  {activeArtifact.linkReferences.length > 0 ? (
                    activeArtifact.linkReferences.map((reference, index) => {
                      const key = `${reference.href}:${index}`;
                      if (!reference.isLocal) {
                        return (
                          <li key={key}>
                            <a href={reference.href} target="_blank" rel="noreferrer">
                              {reference.label || reference.href}
                            </a>
                          </li>
                        );
                      }

                      if (!reference.isResolved || !reference.attachmentId) {
                        return (
                          <li key={key}>
                            <span className="archaeologist-link-unresolved">
                              {reference.label || reference.href}: unresolved local link
                            </span>
                          </li>
                        );
                      }

                      const attachment = activeArtifact.attachments.find(
                        (entry) => entry.attachmentId === reference.attachmentId,
                      );

                      if (!attachment) {
                        return (
                          <li key={key}>
                            <span className="archaeologist-link-unresolved">
                              {reference.label || reference.href}: attachment metadata missing
                            </span>
                          </li>
                        );
                      }

                      const absolutePath = buildAttachmentAbsolutePath({
                        workspaceRoot,
                        subjectId: activeSubjectId,
                        roomId: selectedRoomId,
                        relativePath: attachment.relativePath,
                      });
                      const fileUri = toFileUri(absolutePath);

                      return (
                        <li key={key}>
                          {fileUri ? (
                            <a href={fileUri} target="_blank" rel="noreferrer">
                              {reference.label || attachment.fileName}
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setStatusMessage(`Attachment path: ${absolutePath}`)}
                              aria-label={`Show local attachment path for ${attachment.fileName}`}
                            >
                              Show path for {reference.label || attachment.fileName}
                            </button>
                          )}
                        </li>
                      );
                    })
                  ) : (
                    <li>No markdown links found in this artifact.</li>
                  )}
                </ul>

                <h3>Attachment Inventory</h3>
                <ul>
                  {activeArtifact.attachments.map((attachment) => {
                    const absolutePath = buildAttachmentAbsolutePath({
                      workspaceRoot,
                      subjectId: activeSubjectId,
                      roomId: selectedRoomId,
                      relativePath: attachment.relativePath,
                    });
                    const fileUri = toFileUri(absolutePath);

                    return (
                      <li key={attachment.attachmentId}>
                        <span>
                          {attachment.fileName} ({attachment.mimeType})
                        </span>
                        {fileUri ? (
                          <a href={fileUri} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setStatusMessage(`Attachment path: ${absolutePath}`)}
                            aria-label={`Show local path for attachment ${attachment.fileName}`}
                          >
                            Show Path
                          </button>
                        )}
                        {!attachment.isLinkedInMarkdown ? <em>Not linked in markdown</em> : null}
                      </li>
                    );
                  })}
                </ul>

                {activeArtifact.unresolvedLocalLinks.length > 0 ? (
                  <div className="warning-surface" role="note" aria-label="Unresolved local links in artifact markdown">
                    <p>
                      Unresolved local links: {activeArtifact.unresolvedLocalLinks.join(", ")}
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="helper-text">Open a reviewable room to read its artifact and linked attachments.</p>
          )}
        </section>

        <section className="archaeologist-card" aria-labelledby="archaeologist-prompts-heading">
          <h2 id="archaeologist-prompts-heading">Self-Check Prompts</h2>
          {activePromptText.length > 0 ? (
            <ol className="archaeologist-prompt-list" aria-label="Deterministic room self-check prompts">
              {activePromptText.map((prompt, index) => (
                <li key={`${prompt}:${index}`}>{prompt}</li>
              ))}
            </ol>
          ) : (
            <p className="helper-text">Open a room artifact to generate deterministic self-check prompts.</p>
          )}
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