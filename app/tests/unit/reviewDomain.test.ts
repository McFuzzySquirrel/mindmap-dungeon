import { describe, expect, it } from "vitest";

import {
  buildArtifactPresentationContract,
  buildReviewTraversal,
  buildReviewRoomReviewedEvent,
  evaluateReviewUnlock,
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
});
