import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  addCrossLinkToCreatorState,
  addLinkedRoomsToCreatorState,
  getDeterministicTopicSuggestions,
  initializeCreatorState,
  markCreatorRoomVisited,
  type CreatorState,
} from "@features/creator";
import { hasScribeStarted, type GraphDomainError } from "@core/graph";
import { type EdgeRelationType } from "@core/validation/persistence";
import { FileStore, createSubjectIdFromName } from "@services/fileStore";

import { buildActionableWarning, type ActionableWarning } from "./foundationWarnings";

type PendingMutation =
  | {
      kind: "linked";
      fromRoomId: string;
      relationType: EdgeRelationType;
      topics: string[];
    }
  | {
      kind: "cross-link";
      fromRoomId: string;
      toRoomId: string;
      relationType: EdgeRelationType;
    };

const DEFAULT_WORKSPACE_ROOT = ".";
const EDGE_RELATIONS: EdgeRelationType[] = [
  "subtopic",
  "prerequisite",
  "related",
  "depends_on",
  "analogy",
];

function toGraphErrorMessage(error: GraphDomainError): string {
  const detail =
    error.details && Object.keys(error.details).length > 0
      ? ` Details: ${JSON.stringify(error.details)}`
      : "";
  return `${error.code}: ${error.message}${detail}`;
}

function parseTopicDrafts(rawText: string): string[] {
  return rawText
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function CreatorDungeonScreen(): JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(DEFAULT_WORKSPACE_ROOT);
  const [subjectName, setSubjectName] = useState<string>("");
  const [rootTopic, setRootTopic] = useState<string>("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [activeSubjectId, setActiveSubjectId] = useState<string>("");

  const [creatorState, setCreatorState] = useState<CreatorState | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string>("");

  const [newTopicDrafts, setNewTopicDrafts] = useState<string>("");
  const [newTopicRelationType, setNewTopicRelationType] = useState<EdgeRelationType>("subtopic");

  const [crossLinkFrom, setCrossLinkFrom] = useState<string>("");
  const [crossLinkTo, setCrossLinkTo] = useState<string>("");
  const [crossLinkRelationType, setCrossLinkRelationType] =
    useState<EdgeRelationType>("related");

  const [suggestionsSourceRoomId, setSuggestionsSourceRoomId] = useState<string>("");
  const [suggestedTopics, setSuggestedTopics] = useState<
    Array<{ topic: string; reason: string }>
  >([]);
  const [pendingSuggestedTopic, setPendingSuggestedTopic] = useState<string>("");

  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [warning, setWarning] = useState<ActionableWarning | null>(null);
  const [graphFeedback, setGraphFeedback] = useState<string>("");
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

  const roomLookup = useMemo(() => {
    const map = new Map<string, { topic: string; status: string }>();
    if (!creatorState) {
      return map;
    }

    for (const room of creatorState.dungeon.rooms) {
      map.set(room.roomId, {
        topic: room.topic,
        status: room.status,
      });
    }

    return map;
  }, [creatorState]);

  const currentRoom = currentRoomId ? roomLookup.get(currentRoomId) : undefined;

  const connectedEdges = useMemo(() => {
    if (!creatorState || !currentRoomId) {
      return [];
    }

    return creatorState.dungeon.edges.filter(
      (edge) => edge.fromRoomId === currentRoomId || edge.toRoomId === currentRoomId,
    );
  }, [creatorState, currentRoomId]);

  const canMutateWithWarning = useMemo(() => {
    if (!creatorState) {
      return false;
    }

    return hasScribeStarted(creatorState.dungeon.phaseState);
  }, [creatorState]);

  const persistDungeonState = useCallback(
    async (nextState: CreatorState, changedRoomIds: string[]) => {
      if (!activeSubjectId) {
        throw new Error("Active subject is not set.");
      }

      const fileStore = new FileStore({ workspaceRoot, subjectId: activeSubjectId });
      await fileStore.saveDungeon(nextState.dungeon);

      const uniqueRoomIds = Array.from(new Set(changedRoomIds));
      for (const roomId of uniqueRoomIds) {
        const room = nextState.rooms[roomId];
        if (!room) {
          continue;
        }
        await fileStore.saveRoom(room, false);
      }
    },
    [activeSubjectId, workspaceRoot],
  );

  const executeMutation = useCallback(
    async (mutation: PendingMutation) => {
      if (!creatorState) {
        return;
      }

      const nowIso = new Date().toISOString();

      if (mutation.kind === "linked") {
        const drafts = mutation.topics.map((topic) => ({
          roomId: FileStore.generateRoomId(),
          topic,
          relationType: mutation.relationType,
        }));

        const result = addLinkedRoomsToCreatorState(creatorState, {
          fromRoomId: mutation.fromRoomId,
          drafts,
          nowIso,
        });

        if (!result.ok) {
          setGraphFeedback(toGraphErrorMessage(result.error));
          return;
        }

        const changedIds = [
          ...result.value.summary.touchedRoomIds,
          ...result.value.summary.revalidationRevokedRoomIds,
        ];

        await persistDungeonState(result.value.state, changedIds);
        setCreatorState(result.value.state);
        setGraphFeedback("");
        setStatusMessage(
          `Added ${drafts.length} linked room(s) from ${mutation.fromRoomId}.`,
        );
        setWarning(null);
      }

      if (mutation.kind === "cross-link") {
        const result = addCrossLinkToCreatorState(creatorState, {
          fromRoomId: mutation.fromRoomId,
          toRoomId: mutation.toRoomId,
          relationType: mutation.relationType,
          nowIso,
        });

        if (!result.ok) {
          setGraphFeedback(toGraphErrorMessage(result.error));
          return;
        }

        const changedIds = [
          ...result.value.summary.touchedRoomIds,
          ...result.value.summary.revalidationRevokedRoomIds,
        ];

        await persistDungeonState(result.value.state, changedIds);
        setCreatorState(result.value.state);
        setGraphFeedback("");
        setStatusMessage(
          `Added cross-link ${mutation.fromRoomId} -> ${mutation.toRoomId}.`,
        );
        setWarning(null);
      }
    },
    [creatorState, persistDungeonState],
  );

  const confirmOrRunMutation = useCallback(
    async (mutation: PendingMutation) => {
      if (canMutateWithWarning) {
        setPendingMutation(mutation);
        setWarning({
          title: "Revalidation warning",
          message:
            "Scribe has started. Graph changes may mark connected rooms as NeedsRevalidation.",
          remediation:
            "Review the graph edit, then confirm to continue. Cancel to keep the current map unchanged.",
        });
        return;
      }

      setIsLoading(true);
      try {
        await executeMutation(mutation);
      } catch (error) {
        setWarning(buildActionableWarning(error, "Could not apply graph mutation"));
      } finally {
        setIsLoading(false);
      }
    },
    [canMutateWithWarning, executeMutation],
  );

  const handleCreateSubject = useCallback(async () => {
    if (!subjectName.trim() || !rootTopic.trim()) {
      setWarning({
        title: "Missing root-room details",
        message: "Subject name and root topic are both required.",
        remediation: "Provide both fields to create a new subject graph.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const subjectId = createSubjectIdFromName(subjectName);
      const fileStore = new FileStore({ workspaceRoot, subjectId });
      await fileStore.createDungeon(subjectName.trim(), rootTopic.trim());
      const loaded = await fileStore.loadDungeon();
      const initialized = initializeCreatorState({ loadedSubject: loaded });

      if (!initialized.ok) {
        setGraphFeedback(toGraphErrorMessage(initialized.error));
        return;
      }

      setCreatorState(initialized.value);
      setActiveSubjectId(subjectId);
      setCurrentRoomId(initialized.value.dungeon.rootRoomId);
      setCrossLinkFrom(initialized.value.dungeon.rootRoomId);
      setCrossLinkTo(initialized.value.dungeon.rootRoomId);
      setSelectedSubjectId(subjectId);
      setStatusMessage(`Created subject ${subjectId} and opened Creator.`);
      setWarning(null);
      setGraphFeedback("");
      setSubjectName("");
      setRootTopic("");
      await loadSubjects();
    } catch (error) {
      setWarning(buildActionableWarning(error, "Could not create subject"));
    } finally {
      setIsLoading(false);
    }
  }, [loadSubjects, rootTopic, subjectName, workspaceRoot]);

  const handleOpenSubject = useCallback(async () => {
    const subjectId = selectedSubjectId.trim();
    if (!subjectId) {
      setWarning({
        title: "No subject selected",
        message: "Choose an existing subject to resume Creator flow.",
        remediation: "Select a subject ID and retry open.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const fileStore = new FileStore({ workspaceRoot, subjectId });
      const loaded = await fileStore.loadDungeon();
      const initialized = initializeCreatorState({ loadedSubject: loaded });

      if (!initialized.ok) {
        setGraphFeedback(toGraphErrorMessage(initialized.error));
        return;
      }

      setCreatorState(initialized.value);
      setActiveSubjectId(subjectId);
      setCurrentRoomId(initialized.value.dungeon.rootRoomId);
      setCrossLinkFrom(initialized.value.dungeon.rootRoomId);
      setCrossLinkTo(initialized.value.dungeon.rootRoomId);
      setStatusMessage(
        `Resumed ${subjectId} at phase ${initialized.value.dungeon.phaseState}.`,
      );
      setWarning(null);
      setGraphFeedback("");
    } catch (error) {
      setWarning(buildActionableWarning(error, "Could not open selected subject"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubjectId, workspaceRoot]);

  const handleNavigateToRoom = useCallback(
    async (roomId: string) => {
      if (!creatorState) {
        return;
      }

      setIsLoading(true);
      try {
        const result = markCreatorRoomVisited(creatorState, roomId);
        if (!result.ok) {
          setGraphFeedback(toGraphErrorMessage(result.error));
          return;
        }

        await persistDungeonState(result.value, [roomId]);
        setCreatorState(result.value);
        setCurrentRoomId(roomId);
        setStatusMessage(`Entered room ${roomId}.`);
        setWarning(null);
        setGraphFeedback("");
      } catch (error) {
        setWarning(buildActionableWarning(error, "Could not navigate to room"));
      } finally {
        setIsLoading(false);
      }
    },
    [creatorState, persistDungeonState],
  );

  const handleAddLinkedRooms = useCallback(async () => {
    if (!creatorState || !currentRoomId) {
      setWarning({
        title: "No active room",
        message: "Open a subject and choose a current room first.",
        remediation: "Resume a subject, then add linked topics from the current room.",
      });
      return;
    }

    const topics = parseTopicDrafts(newTopicDrafts);
    if (topics.length === 0) {
      setWarning({
        title: "No linked topics entered",
        message: "Add one topic per line before confirming expansion.",
        remediation: "Provide at least one non-empty topic line.",
      });
      return;
    }

    await confirmOrRunMutation({
      kind: "linked",
      fromRoomId: currentRoomId,
      relationType: newTopicRelationType,
      topics,
    });
    setNewTopicDrafts("");
    setSuggestedTopics([]);
    setPendingSuggestedTopic("");
  }, [
    confirmOrRunMutation,
    creatorState,
    currentRoomId,
    newTopicDrafts,
    newTopicRelationType,
  ]);

  const handleAddCrossLink = useCallback(async () => {
    if (!creatorState) {
      return;
    }

    if (!crossLinkFrom || !crossLinkTo) {
      setWarning({
        title: "Cross-link endpoints required",
        message: "Both source and target rooms are required.",
        remediation: "Select two existing rooms and try again.",
      });
      return;
    }

    await confirmOrRunMutation({
      kind: "cross-link",
      fromRoomId: crossLinkFrom,
      toRoomId: crossLinkTo,
      relationType: crossLinkRelationType,
    });
  }, [confirmOrRunMutation, creatorState, crossLinkFrom, crossLinkRelationType, crossLinkTo]);

  const handleLoadSuggestions = useCallback(() => {
    if (!creatorState || !currentRoomId) {
      return;
    }

    const sourceRoomId = suggestionsSourceRoomId || currentRoomId;
    const result = getDeterministicTopicSuggestions(creatorState, sourceRoomId, 5);
    if (!result.ok) {
      setGraphFeedback(toGraphErrorMessage(result.error));
      return;
    }

    setSuggestionsSourceRoomId(sourceRoomId);
    setSuggestedTopics(
      result.value.suggestions.map((suggestion) => ({
        topic: suggestion.topic,
        reason: suggestion.reason,
      })),
    );
    setPendingSuggestedTopic("");
    setGraphFeedback("");
  }, [creatorState, currentRoomId, suggestionsSourceRoomId]);

  const handleConfirmSuggestedTopic = useCallback(async () => {
    if (!creatorState || !pendingSuggestedTopic) {
      return;
    }

    const sourceRoomId = suggestionsSourceRoomId || currentRoomId;
    if (!sourceRoomId) {
      return;
    }

    await confirmOrRunMutation({
      kind: "linked",
      fromRoomId: sourceRoomId,
      relationType: "subtopic",
      topics: [pendingSuggestedTopic],
    });
    setPendingSuggestedTopic("");
  }, [
    confirmOrRunMutation,
    creatorState,
    currentRoomId,
    pendingSuggestedTopic,
    suggestionsSourceRoomId,
  ]);

  const guidance = creatorState?.guidance;

  return (
    <div className="creator-shell">
      <header className="creator-header" aria-live="polite">
        <h1>Creator Dungeon</h1>
        <p>
          Build your subject graph room by room. Root setup, traversal, progress guidance,
          cross-links, and deterministic suggestions are all local-first.
        </p>
      </header>

      <main className="creator-grid" aria-label="Creator dungeon workspace">
        <section className="creator-card" aria-labelledby="creator-root-heading">
          <h2 id="creator-root-heading">Root-Room Prompt</h2>
          <div className="field-grid" role="group" aria-label="Create a new subject graph">
            <label htmlFor="creator-workspace-root">Workspace root</label>
            <input
              id="creator-workspace-root"
              value={workspaceRoot}
              onChange={(event) => setWorkspaceRoot(event.target.value)}
              placeholder="/path/to/workspace"
            />

            <button type="button" onClick={() => void loadSubjects()} disabled={isLoading}>
              Refresh Subject List
            </button>

            <label htmlFor="creator-subject-name">Subject name</label>
            <input
              id="creator-subject-name"
              value={subjectName}
              onChange={(event) => setSubjectName(event.target.value)}
              placeholder="Biology 101"
            />

            <label htmlFor="creator-root-topic">Root topic</label>
            <input
              id="creator-root-topic"
              value={rootTopic}
              onChange={(event) => setRootTopic(event.target.value)}
              placeholder="Cell Theory"
            />

            <button type="button" onClick={() => void handleCreateSubject()} disabled={isLoading}>
              Create Root Room and Subject
            </button>
          </div>

          <div className="field-grid" role="group" aria-label="Resume an existing subject graph">
            <h3>Resume Existing Subject</h3>
            <label htmlFor="creator-existing-subject">Existing subject ID</label>
            <select
              id="creator-existing-subject"
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

            <button type="button" onClick={() => void handleOpenSubject()} disabled={isLoading}>
              Open Subject in Creator
            </button>
          </div>

          <p className="status-text">
            Active subject: {activeSubjectId || "None"}
            {creatorState ? ` | Phase: ${creatorState.dungeon.phaseState}` : ""}
          </p>
        </section>

        <section className="creator-card" aria-labelledby="creator-traversal-heading">
          <h2 id="creator-traversal-heading">Traversal and Expansion</h2>

          {creatorState && currentRoom ? (
            <>
              <div className="creator-room-surface">
                <h3>Current room</h3>
                <p>
                  <strong>{currentRoom.topic}</strong>
                </p>
                <p>
                  Room ID: {currentRoomId} | Status: {currentRoom.status}
                </p>
              </div>

              <div className="field-grid" role="group" aria-label="Connected topics and room traversal">
                <h3>Connected topics</h3>
                {connectedEdges.length === 0 ? (
                  <p className="helper-text">No edges connected to the current room yet.</p>
                ) : (
                  <ul className="creator-list">
                    {connectedEdges.map((edge) => {
                      const destinationId =
                        edge.fromRoomId === currentRoomId ? edge.toRoomId : edge.fromRoomId;
                      const destination = roomLookup.get(destinationId);

                      return (
                        <li key={`${edge.fromRoomId}:${edge.toRoomId}:${edge.relationType}`}>
                          <div>
                            <strong>{destination?.topic ?? destinationId}</strong>
                            <span>
                              {" "}
                              ({edge.relationType}, {destination?.status ?? "unknown"})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleNavigateToRoom(destinationId)}
                            disabled={isLoading}
                          >
                            Enter Room
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="field-grid" role="group" aria-label="Add linked rooms from current room">
                <h3>Expand current room</h3>
                <label htmlFor="linked-room-relation">Relation type</label>
                <select
                  id="linked-room-relation"
                  value={newTopicRelationType}
                  onChange={(event) =>
                    setNewTopicRelationType(event.target.value as EdgeRelationType)
                  }
                >
                  {EDGE_RELATIONS.map((relation) => (
                    <option key={relation} value={relation}>
                      {relation}
                    </option>
                  ))}
                </select>

                <label htmlFor="linked-topics-input">Linked topics (one per line)</label>
                <textarea
                  id="linked-topics-input"
                  value={newTopicDrafts}
                  onChange={(event) => setNewTopicDrafts(event.target.value)}
                  rows={4}
                  placeholder={"Mitosis\nCell Organelles\nDNA Replication"}
                />

                <button
                  type="button"
                  onClick={() => void handleAddLinkedRooms()}
                  disabled={isLoading}
                >
                  Confirm Linked Rooms
                </button>
              </div>

              <div className="field-grid" role="group" aria-label="Optional deterministic topic suggestions">
                <h3>Deterministic Suggestions</h3>
                <label htmlFor="suggestions-source-room">Suggestions source room</label>
                <select
                  id="suggestions-source-room"
                  value={suggestionsSourceRoomId || currentRoomId}
                  onChange={(event) => setSuggestionsSourceRoomId(event.target.value)}
                >
                  {creatorState.dungeon.rooms.map((room) => (
                    <option key={room.roomId} value={room.roomId}>
                      {room.topic} ({room.roomId})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleLoadSuggestions}
                  disabled={isLoading}
                >
                  Generate Suggestions
                </button>

                {suggestedTopics.length > 0 ? (
                  <ul className="creator-list">
                    {suggestedTopics.map((suggestion) => (
                      <li key={suggestion.topic}>
                        <div>
                          <strong>{suggestion.topic}</strong>
                          <span> ({suggestion.reason})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingSuggestedTopic(suggestion.topic)}
                          disabled={isLoading}
                        >
                          Select for Confirm
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper-text">
                    Suggestions are optional and never auto-committed.
                  </p>
                )}

                {pendingSuggestedTopic ? (
                  <div className="status-surface">
                    <p>
                      Selected suggestion: <strong>{pendingSuggestedTopic}</strong>
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleConfirmSuggestedTopic()}
                      disabled={isLoading}
                    >
                      Confirm Suggested Topic
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="helper-text">
              Create or open a subject to start traversing rooms.
            </p>
          )}
        </section>

        <section className="creator-card" aria-labelledby="creator-cross-link-heading">
          <h2 id="creator-cross-link-heading">Cross-Link Existing Rooms</h2>
          {creatorState ? (
            <div className="field-grid" role="group" aria-label="Create a cross-link">
              <label htmlFor="cross-link-from">From room</label>
              <select
                id="cross-link-from"
                value={crossLinkFrom}
                onChange={(event) => setCrossLinkFrom(event.target.value)}
              >
                {creatorState.dungeon.rooms.map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.topic} ({room.roomId})
                  </option>
                ))}
              </select>

              <label htmlFor="cross-link-to">To room</label>
              <select
                id="cross-link-to"
                value={crossLinkTo}
                onChange={(event) => setCrossLinkTo(event.target.value)}
              >
                {creatorState.dungeon.rooms.map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.topic} ({room.roomId})
                  </option>
                ))}
              </select>

              <label htmlFor="cross-link-relation">Relation type</label>
              <select
                id="cross-link-relation"
                value={crossLinkRelationType}
                onChange={(event) =>
                  setCrossLinkRelationType(event.target.value as EdgeRelationType)
                }
              >
                {EDGE_RELATIONS.map((relation) => (
                  <option key={relation} value={relation}>
                    {relation}
                  </option>
                ))}
              </select>

              <button type="button" onClick={() => void handleAddCrossLink()} disabled={isLoading}>
                Confirm Cross-Link
              </button>
              <p className="helper-text">
                Domain validation feedback appears below for duplicate edges, self-loop links,
                or unknown room IDs.
              </p>
            </div>
          ) : (
            <p className="helper-text">Open a subject before creating cross-links.</p>
          )}
        </section>

        <section className="creator-card" aria-labelledby="creator-progress-heading">
          <h2 id="creator-progress-heading">Creator Progress Guidance</h2>
          {guidance ? (
            <div className="creator-progress-grid">
              <div className="creator-progress-panel">
                <h3>Visited</h3>
                <p>{guidance.visitedRoomIds.length}</p>
                <ul className="creator-tag-list">
                  {guidance.visitedRoomIds.map((roomId) => (
                    <li key={roomId}>{roomLookup.get(roomId)?.topic ?? roomId}</li>
                  ))}
                </ul>
              </div>

              <div className="creator-progress-panel">
                <h3>Unresolved</h3>
                <p>{guidance.unresolvedRoomIds.length}</p>
                <ul className="creator-tag-list">
                  {guidance.unresolvedRoomIds.map((roomId) => (
                    <li key={roomId}>{roomLookup.get(roomId)?.topic ?? roomId}</li>
                  ))}
                </ul>
              </div>

              <div className="creator-progress-panel">
                <h3>Needs Revalidation</h3>
                <p>{guidance.revalidationNeededRoomIds.length}</p>
                <ul className="creator-tag-list">
                  {guidance.revalidationNeededRoomIds.map((roomId) => (
                    <li key={roomId}>{roomLookup.get(roomId)?.topic ?? roomId}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="helper-text">Progress guidance appears after opening a subject.</p>
          )}
        </section>

        <section className="creator-card" aria-labelledby="creator-status-heading">
          <h2 id="creator-status-heading">Warnings and Status</h2>
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
              {warning.backupGuidance ? (
                <p>
                  <strong>Backup guidance:</strong> {warning.backupGuidance}
                </p>
              ) : null}

              {pendingMutation ? (
                <div className="creator-confirm-row">
                  <button
                    type="button"
                    className="warning-action"
                    onClick={async () => {
                      setIsLoading(true);
                      try {
                        await executeMutation(pendingMutation);
                        setPendingMutation(null);
                        setWarning(null);
                      } catch (error) {
                        setWarning(buildActionableWarning(error, "Could not confirm graph edit"));
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    disabled={isLoading}
                  >
                    Confirm Graph Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingMutation(null);
                      setWarning(null);
                    }}
                    disabled={isLoading}
                  >
                    Cancel Edit
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="status-text">No active warnings.</p>
          )}

          {graphFeedback ? (
            <div className="warning-surface" role="status" aria-live="polite">
              <h3>Graph Validation Feedback</h3>
              <p>{graphFeedback}</p>
            </div>
          ) : null}

          <div className="status-surface" aria-live="polite">
            <h3>Recent status</h3>
            <p>{statusMessage || "No recent creator actions."}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
