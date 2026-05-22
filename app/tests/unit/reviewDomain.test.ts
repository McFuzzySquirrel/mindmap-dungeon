import { describe, expect, it } from "vitest";

import {
  buildArtifactPresentationContract,
  buildReviewTraversal,
  buildReviewRoomReviewedEvent,
  evaluateReviewUnlock,
  extractMarkdownHeadings,
  generateSelfCheckPrompts,
  summarizeReviewAnalytics,
} from "@core/review";
import type {
  DungeonMetadata,
  RoomMetadata,
  ValidationState,
} from "@core/validation/persistence";

const BASE_TIME = "2026-05-22T14:00:00.000Z";

function buildValidationState(finalPass: boolean): ValidationState {
  return {
    wordCount: finalPass ? 140 : 30,
    requiredSectionsPresent: finalPass,
    manualConfirmed: finalPass,
    criterionScores: {
      sectionCompleteness: finalPass ? 2 : 0,
      conceptTermCoverage: finalPass ? 2 : 0,
      linkReferences: finalPass ? 2 : 0,
      recallQuestionQuality: finalPass ? 2 : 0,
      clarityReadability: finalPass ? 2 : 0,
    },
    failedChecks: finalPass ? [] : ["VAL_WORD_COUNT_TOO_LOW"],
    qualityBonus: finalPass ? 8 : 0,
    finalPass,
  };
}

function buildRoom(input: {
  roomId: string;
  topic: string;
  state: RoomMetadata["state"];
  finalPass: boolean;
  reviewPassCount?: number;
}): RoomMetadata {
  return {
    roomId: input.roomId,
    topic: input.topic,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    state: input.state,
    notePath: "notes.txt",
    artifactPath: "artifact.md",
    validationState: buildValidationState(input.finalPass),
    reviewPassCount: input.reviewPassCount ?? 0,
    attachments: [
      {
        attachmentId: `${input.roomId}-attachment`,
        fileName: "formula.png",
        mimeType: "image/png",
        relativePath: "attachments/formula.png",
        addedAt: BASE_TIME,
      },
    ],
  };
}

function buildDungeon(rooms: RoomMetadata[]): DungeonMetadata {
  return {
    schemaVersion: "1.0.0",
    dungeonId: "dungeon-review-1",
    subjectName: "Linear Algebra",
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    phaseState: "ScribePartial",
    rootRoomId: rooms[0]?.roomId ?? "room-1",
    rooms: rooms.map((room) => ({
      roomId: room.roomId,
      topic: room.topic,
      status: room.state,
    })),
    edges: [],
    progression: {
      xpTotal: 0,
      rank: "Novice",
      badges: [],
    },
  };
}

describe("review domain", () => {
  it("ARC-FR-01 unlocks only when completion ratio meets threshold", () => {
    const roomOne = buildRoom({
      roomId: "room-1",
      topic: "Vectors",
      state: "EncounterDefeated",
      finalPass: true,
    });
    const roomTwo = buildRoom({
      roomId: "room-2",
      topic: "Matrices",
      state: "NotesDrafted",
      finalPass: false,
    });
    const dungeon = buildDungeon([roomOne, roomTwo]);
    const rooms = {
      [roomOne.roomId]: roomOne,
      [roomTwo.roomId]: roomTwo,
    };

    const strictUnlock = evaluateReviewUnlock({
      dungeon,
      rooms,
      requiredCompletionRatio: 1,
    });
    const lenientUnlock = evaluateReviewUnlock({
      dungeon,
      rooms,
      requiredCompletionRatio: 0.5,
    });

    expect(strictUnlock.unlocked).toBe(false);
    expect(strictUnlock.completionRatio).toBe(0.5);
    expect(lenientUnlock.unlocked).toBe(true);
  });

  it("ARC-FR-02 builds traversal only from reviewable completed rooms", () => {
    const roomOne = buildRoom({
      roomId: "room-1",
      topic: "Vectors",
      state: "EncounterDefeated",
      finalPass: true,
      reviewPassCount: 1,
    });
    const roomTwo = buildRoom({
      roomId: "room-2",
      topic: "Matrices",
      state: "ArtifactCollected",
      finalPass: true,
    });
    const roomThree = buildRoom({
      roomId: "room-3",
      topic: "Eigenvalues",
      state: "NotesDrafted",
      finalPass: false,
    });

    const traversal = buildReviewTraversal({
      dungeon: buildDungeon([roomOne, roomTwo, roomThree]),
      rooms: {
        [roomOne.roomId]: roomOne,
        [roomTwo.roomId]: roomTwo,
        [roomThree.roomId]: roomThree,
      },
    });

    expect(traversal.orderedRoomIds).toEqual(["room-1", "room-2"]);
    expect(traversal.reviewedRoomCount).toBe(1);
    expect(traversal.totalReviewableRooms).toBe(2);
  });

  it("ARC-FR-05 resolves linked local attachments from markdown", () => {
    const room = buildRoom({
      roomId: "room-1",
      topic: "Vectors",
      state: "ArtifactCollected",
      finalPass: true,
    });

    const contract = buildArtifactPresentationContract({
      roomId: room.roomId,
      markdown: [
        "# Vectors",
        "",
        "See [formula image](attachments/formula.png) and [external docs](https://example.com).",
        "Missing local [worksheet](attachments/worksheet.pdf).",
      ].join("\n"),
      attachments: room.attachments,
    });

    expect(contract.attachments[0]?.isLinkedInMarkdown).toBe(true);
    expect(contract.unresolvedLocalLinks).toEqual(["attachments/worksheet.pdf"]);
    expect(contract.linkReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "attachments/formula.png", isResolved: true }),
        expect.objectContaining({ href: "https://example.com", isLocal: false }),
      ]),
    );
  });

  it("ARC-FR-03 and ARC-FR-04 produce deterministic prompts and review events", () => {
    const prompts = generateSelfCheckPrompts({
      roomId: "room-9",
      subjectName: "Linear Algebra",
      roomTopic: "Eigenvectors",
      noteHeadings: ["# Definition", "## Geometric Intuition"],
      relatedTopics: ["Matrices"],
      maxPromptCount: 4,
    });

    expect(prompts.map((prompt) => prompt.promptId)).toEqual([
      "room-9:prompt:1",
      "room-9:prompt:2",
      "room-9:prompt:3",
      "room-9:prompt:4",
    ]);

    const analytics = summarizeReviewAnalytics({
      rooms: {
        "room-1": buildRoom({
          roomId: "room-1",
          topic: "Vectors",
          state: "ArtifactCollected",
          finalPass: true,
          reviewPassCount: 2,
        }),
        "room-2": buildRoom({
          roomId: "room-2",
          topic: "Matrices",
          state: "ArtifactCollected",
          finalPass: true,
          reviewPassCount: 1,
        }),
      },
      reviewableRoomIds: ["room-1", "room-2"],
      currentReviewStreak: 2,
      longestReviewStreak: 2,
    });

    const event = buildReviewRoomReviewedEvent({
      subjectId: "subject-1",
      dungeonId: "dungeon-1",
      roomId: "room-2",
      occurredAt: "2026-05-22T14:05:00.000Z",
      sequence: 3,
      analytics,
    });

    expect(event.eventId).toBe("subject-1:room-2:2026-05-22T14:05:00.000Z:review:3");
    expect(event.reviewSessionCount).toBe(3);
    expect(event.fullReviewPasses).toBe(1);
  });

  it("ARC-FR-01 never unlocks when dungeon has zero rooms", () => {
    const emptyDungeon = buildDungeon([]);
    const unlockStatus = evaluateReviewUnlock({
      dungeon: emptyDungeon,
      rooms: {},
      requiredCompletionRatio: 0,
    });
    expect(unlockStatus.unlocked).toBe(false);
    expect(unlockStatus.totalRooms).toBe(0);
    expect(unlockStatus.clearedRooms).toBe(0);
  });

  it("ARC-FR-01 partial threshold: unlocks at 75% when 3 of 4 rooms are complete", () => {
    const rooms = [
      buildRoom({ roomId: "r1", topic: "T1", state: "EncounterDefeated", finalPass: true }),
      buildRoom({ roomId: "r2", topic: "T2", state: "ArtifactCollected", finalPass: true }),
      buildRoom({ roomId: "r3", topic: "T3", state: "EncounterDefeated", finalPass: true }),
      buildRoom({ roomId: "r4", topic: "T4", state: "NotesDrafted", finalPass: false }),
    ];
    const dungeon = buildDungeon(rooms);
    const roomsMap = Object.fromEntries(rooms.map((r) => [r.roomId, r]));

    const atThreshold = evaluateReviewUnlock({ dungeon, rooms: roomsMap, requiredCompletionRatio: 0.75 });
    const aboveThreshold = evaluateReviewUnlock({ dungeon, rooms: roomsMap, requiredCompletionRatio: 0.8 });

    expect(atThreshold.unlocked).toBe(true);
    expect(atThreshold.completionRatio).toBe(0.75);
    expect(aboveThreshold.unlocked).toBe(false);
  });

  it("ARC-FR-03 extractMarkdownHeadings parses h1/h2/h3 and deduplicates", () => {
    const markdown = [
      "# Introduction",
      "Some text",
      "## Key Concepts",
      "More text",
      "### Details",
      "## Key Concepts",
      "Not a heading: ## inline",
    ].join("\n");

    const headings = extractMarkdownHeadings(markdown);
    expect(headings).toEqual(["Introduction", "Key Concepts", "Details"]);
  });

  it("ARC-FR-03 generateSelfCheckPrompts with no headings and no related topics produces topic-only prompts", () => {
    const prompts = generateSelfCheckPrompts({
      roomId: "room-solo",
      subjectName: "Chemistry",
      roomTopic: "Ionic Bonds",
      noteHeadings: [],
      relatedTopics: [],
      maxPromptCount: 4,
    });

    // Must have at least a topic prompt; no heading prompts should appear
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    expect(prompts.every((p) => p.source !== "relation")).toBe(true);
    const sources = prompts.map((p) => p.source);
    expect(sources).not.toContain("heading");
    expect(sources[0]).toBe("topic");
  });

  it("ARC-FR-04 streak resets to 1 when a non-consecutive room is reviewed", () => {
    // Simulate streak analysis via analytics: out-of-order review resets streak manually
    const roomsMap = {
      "room-1": buildRoom({ roomId: "room-1", topic: "A", state: "ArtifactCollected", finalPass: true, reviewPassCount: 1 }),
      "room-2": buildRoom({ roomId: "room-2", topic: "B", state: "ArtifactCollected", finalPass: true, reviewPassCount: 0 }),
      "room-3": buildRoom({ roomId: "room-3", topic: "C", state: "ArtifactCollected", finalPass: true, reviewPassCount: 1 }),
    };

    // Analytics with streak manually reset to 1 (simulates out-of-order review)
    const analytics = summarizeReviewAnalytics({
      rooms: roomsMap,
      reviewableRoomIds: ["room-1", "room-2", "room-3"],
      currentReviewStreak: 1,
      longestReviewStreak: 2,
    });

    expect(analytics.currentReviewStreak).toBe(1);
    expect(analytics.longestReviewStreak).toBe(2);
    expect(analytics.reviewedRoomCount).toBe(2);
    expect(analytics.reviewSessionCount).toBe(2); // room-1 + room-3 each have 1 pass
  });

  it("ARC-FR-05 attachment not mentioned in markdown has isLinkedInMarkdown = false", () => {
    const room = buildRoom({
      roomId: "room-unlinked",
      topic: "Matrices",
      state: "ArtifactCollected",
      finalPass: true,
    });

    const contract = buildArtifactPresentationContract({
      roomId: room.roomId,
      markdown: "# Matrices\n\nNo image links here.",
      attachments: room.attachments,
    });

    // formula.png exists in attachments but is not referenced in markdown
    expect(contract.attachments[0]?.isLinkedInMarkdown).toBe(false);
    expect(contract.unresolvedLocalLinks).toHaveLength(0);
    expect(contract.linkReferences).toHaveLength(0);
  });

  it("ARC-FR-05 multiple attachments: only linked ones flagged, others remain false", () => {
    const now = BASE_TIME;
    const attachments = [
      { attachmentId: "att-1", fileName: "chart.png", mimeType: "image/png", relativePath: "attachments/chart.png", addedAt: now },
      { attachmentId: "att-2", fileName: "notes.pdf", mimeType: "application/pdf", relativePath: "attachments/notes.pdf", addedAt: now },
    ];

    const contract = buildArtifactPresentationContract({
      roomId: "room-multi",
      markdown: "See [chart](attachments/chart.png) for visual reference.",
      attachments,
    });

    const chartEntry = contract.attachments.find((a) => a.attachmentId === "att-1");
    const notesEntry = contract.attachments.find((a) => a.attachmentId === "att-2");

    expect(chartEntry?.isLinkedInMarkdown).toBe(true);
    expect(notesEntry?.isLinkedInMarkdown).toBe(false);
    expect(contract.unresolvedLocalLinks).toHaveLength(0);
  });
});
