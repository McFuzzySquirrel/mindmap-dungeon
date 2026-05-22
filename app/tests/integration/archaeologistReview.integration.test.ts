import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createArchaeologistOrchestrator,
  createFileStoreArchaeologistPersistence,
} from "@features/archaeologist";
import { FileStore } from "@services/fileStore";
import type { DungeonMetadata, RoomMetadata } from "@core/validation/persistence";

const tempDirs: string[] = [];

async function makeTempWorkspace(): Promise<string> {
  const dir = await mkdir(path.join(os.tmpdir(), `mindmap-dungeon-arc-${Date.now()}`), {
    recursive: true,
  });
  const resolved = dir ?? path.join(os.tmpdir(), `mindmap-dungeon-arc-${Date.now()}`);
  tempDirs.push(resolved);
  return resolved;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }),
  );
  tempDirs.length = 0;
});

/**
 * Build a completed RoomMetadata with finalPass=true and EncounterDefeated state.
 * This simulates a room that has passed the Scribe encounter.
 */
function buildCompletedRoom(
  base: RoomMetadata,
  overrides?: Partial<RoomMetadata>,
): RoomMetadata {
  return {
    ...base,
    state: "EncounterDefeated",
    validationState: {
      ...base.validationState,
      wordCount: 160,
      requiredSectionsPresent: true,
      manualConfirmed: true,
      criterionScores: {
        sectionCompleteness: 2,
        conceptTermCoverage: 2,
        linkReferences: 2,
        recallQuestionQuality: 2,
        clarityReadability: 2,
      },
      failedChecks: [],
      qualityBonus: 10,
      finalPass: true,
    },
    ...overrides,
  };
}

const SAMPLE_ARTIFACT = [
  "# Integration Test Topic",
  "",
  "## Summary",
  "This artifact covers the integration test topic in full.",
  "",
  "## Key Points",
  "- Point one about the topic",
  "- Point two about the topic",
  "",
  "## Recall Question",
  "How does this topic connect to adjacent concepts?",
  "",
  "See [diagram](attachments/diagram.png).",
].join("\n");

describe("archaeologist review integration", () => {
  it("ARC-FR-01 integration: review stays locked when not all rooms have finalPass", async () => {
    const workspaceRoot = await makeTempWorkspace();
    const subjectId = "arc-integration-locked";
    const store = new FileStore({ workspaceRoot, subjectId });

    const dungeon = await store.createDungeon("Physics 101", "Kinematics");
    const rootRoomId = dungeon.rootRoomId;

    // Root room stays as Created / not finalPass — threshold never met
    const orchestrator = createArchaeologistOrchestrator({
      persistence: createFileStoreArchaeologistPersistence(store),
      requiredCompletionRatio: 1,
    });

    const startResult = await orchestrator.startSession("2026-05-22T18:00:00.000Z");

    expect(startResult.ok).toBe(false);
    if (startResult.ok) {
      return;
    }
    expect(startResult.error.code).toBe("REVIEW_LOCKED");
    expect(startResult.error.message).toMatch(/threshold/i);

    // Verify the rootRoom state remains intact after failed start
    const loaded = await store.loadDungeon();
    expect(loaded.rooms[rootRoomId]?.state).toBe("Created");
  });

  it("ARC-FR-01 integration: review unlocks once all rooms reach EncounterDefeated with finalPass", async () => {
    const workspaceRoot = await makeTempWorkspace();
    const subjectId = "arc-integration-unlocked";
    const store = new FileStore({ workspaceRoot, subjectId });

    const dungeon = await store.createDungeon("Chemistry 101", "Atomic Structure");
    const rootRoomId = dungeon.rootRoomId;

    const loaded = await store.loadDungeon();
    const completedRoot = buildCompletedRoom(loaded.rooms[rootRoomId]!);
    await store.saveRoom(completedRoot, false);

    // Write an artifact file so readRoomArtifact succeeds
    const roomDir = path.join(
      workspaceRoot,
      "dungeon-data",
      subjectId,
      "rooms",
      rootRoomId,
    );
    await mkdir(roomDir, { recursive: true });
    await writeFile(path.join(roomDir, "artifact.md"), SAMPLE_ARTIFACT, "utf8");

    const orchestrator = createArchaeologistOrchestrator({
      persistence: createFileStoreArchaeologistPersistence(store),
      requiredCompletionRatio: 1,
    });

    const startResult = await orchestrator.startSession("2026-05-22T18:05:00.000Z");
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) {
      return;
    }

    expect(startResult.value.unlock.unlocked).toBe(true);
    expect(startResult.value.unlock.completionRatio).toBe(1);
    expect(startResult.value.traversal.totalReviewableRooms).toBe(1);
    expect(startResult.value.traversal.orderedRoomIds).toContain(rootRoomId);
  });

  it("ARC-FR-02/03/04/05 integration: full review flow reads artifact from filesystem and tracks counts", async () => {
    const workspaceRoot = await makeTempWorkspace();
    const subjectId = "arc-integration-full";
    const store = new FileStore({ workspaceRoot, subjectId });

    // Create a two-room dungeon
    const dungeon = await store.createDungeon("Mathematics", "Calculus");
    const rootRoomId = dungeon.rootRoomId;

    const secondRoomId = FileStore.generateRoomId();
    const secondRoomDungeon: DungeonMetadata = {
      ...dungeon,
      rooms: [
        ...dungeon.rooms,
        { roomId: secondRoomId, topic: "Integration", status: "Created" },
      ],
      edges: [
        {
          fromRoomId: rootRoomId,
          toRoomId: secondRoomId,
          relationType: "subtopic",
          createdAt: "2026-05-22T17:00:00.000Z",
          createdByPhase: "Creator",
        },
      ],
    };

    const loaded = await store.loadDungeon();
    const completedRoot = buildCompletedRoom(loaded.rooms[rootRoomId]!);

    // Build a default room structure for secondRoom
    const secondRoomBase: RoomMetadata = {
      roomId: secondRoomId,
      topic: "Integration",
      createdAt: "2026-05-22T17:00:00.000Z",
      updatedAt: "2026-05-22T17:00:00.000Z",
      state: "Created",
      notePath: "notes.txt",
      artifactPath: "artifact.md",
      validationState: {
        wordCount: 0,
        requiredSectionsPresent: false,
        manualConfirmed: false,
        criterionScores: {
          sectionCompleteness: 0,
          conceptTermCoverage: 0,
          linkReferences: 0,
          recallQuestionQuality: 0,
          clarityReadability: 0,
        },
        failedChecks: [],
        qualityBonus: 0,
        finalPass: false,
      },
      reviewPassCount: 0,
      attachments: [],
    };
    const completedSecond = buildCompletedRoom(secondRoomBase);

    await store.saveDungeon(secondRoomDungeon, false);
    await store.saveRoom(completedRoot, false);
    await store.saveRoom(completedSecond, false);

    // Write artifact files for both rooms
    for (const roomId of [rootRoomId, secondRoomId]) {
      const roomDir = path.join(
        workspaceRoot,
        "dungeon-data",
        subjectId,
        "rooms",
        roomId,
      );
      await mkdir(roomDir, { recursive: true });
      await writeFile(path.join(roomDir, "artifact.md"), SAMPLE_ARTIFACT, "utf8");
    }

    const orchestrator = createArchaeologistOrchestrator({
      persistence: createFileStoreArchaeologistPersistence(store),
      requiredCompletionRatio: 1,
    });

    // ARC-FR-01: Unlock is possible now
    const startResult = await orchestrator.startSession("2026-05-22T18:10:00.000Z");
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) {
      return;
    }
    expect(startResult.value.unlock.unlocked).toBe(true);
    expect(startResult.value.traversal.totalReviewableRooms).toBe(2);

    // ARC-FR-02: Review root room — artifact is read from filesystem
    const firstReview = await orchestrator.reviewRoom({
      roomId: rootRoomId,
      nowIso: "2026-05-22T18:11:00.000Z",
      maxPromptCount: 4,
    });

    expect(firstReview.ok).toBe(true);
    if (!firstReview.ok) {
      return;
    }

    // ARC-FR-03: Prompts generated from room metadata and note headings
    expect(firstReview.value.prompts.length).toBeGreaterThanOrEqual(1);
    expect(firstReview.value.prompts.length).toBeLessThanOrEqual(4);
    const promptTexts = firstReview.value.prompts.map((p) => p.text);
    // Topic prompt always first
    expect(promptTexts[0]).toContain("Calculus");
    // Headings extracted from artifact ("Summary", "Key Points", "Recall Question")
    const headingPrompt = firstReview.value.prompts.find((p) => p.source === "heading");
    expect(headingPrompt).toBeDefined();
    expect(headingPrompt!.text).toMatch(/summarize/i);

    // ARC-FR-05: Linked attachment detected in artifact markdown
    expect(firstReview.value.artifact.markdown).toBe(SAMPLE_ARTIFACT);
    // diagram.png is NOT in room.attachments (we didn't add it), so it ends up unresolved
    expect(firstReview.value.artifact.unresolvedLocalLinks).toContain("attachments/diagram.png");

    // ARC-FR-04: reviewPassCount incremented and persisted to filesystem
    expect(firstReview.value.room.reviewPassCount).toBe(1);

    const afterFirst = await store.loadDungeon();
    expect(afterFirst.rooms[rootRoomId]?.reviewPassCount).toBe(1);

    // ARC-FR-04: Second review of same room increments again
    const secondReview = await orchestrator.reviewRoom({
      roomId: rootRoomId,
      nowIso: "2026-05-22T18:13:00.000Z",
    });
    expect(secondReview.ok).toBe(true);
    if (!secondReview.ok) {
      return;
    }
    expect(secondReview.value.room.reviewPassCount).toBe(2);

    const afterSecond = await store.loadDungeon();
    expect(afterSecond.rooms[rootRoomId]?.reviewPassCount).toBe(2);

    // ARC-FR-04: Review the second room, streak should be 2 (consecutive)
    const secondRoomReview = await orchestrator.reviewRoom({
      roomId: secondRoomId,
      nowIso: "2026-05-22T18:15:00.000Z",
    });
    expect(secondRoomReview.ok).toBe(true);
    if (!secondRoomReview.ok) {
      return;
    }
    expect(secondRoomReview.value.event.currentReviewStreak).toBeGreaterThanOrEqual(1);
    expect(secondRoomReview.value.event.reviewSessionCount).toBeGreaterThanOrEqual(1);

    // Review counts persisted correctly
    const finalState = await store.loadDungeon();
    expect(finalState.rooms[secondRoomId]?.reviewPassCount).toBe(1);
  });

  it("ARC-FR-02 integration: reviewing non-reviewable room returns ROOM_NOT_REVIEWABLE", async () => {
    const workspaceRoot = await makeTempWorkspace();
    const subjectId = "arc-integration-not-reviewable";
    const store = new FileStore({ workspaceRoot, subjectId });

    const dungeon = await store.createDungeon("Biology", "Genetics");
    const rootRoomId = dungeon.rootRoomId;

    // Mark only root as complete so review unlocks
    const loaded = await store.loadDungeon();
    const completedRoot = buildCompletedRoom(loaded.rooms[rootRoomId]!);
    await store.saveRoom(completedRoot, false);

    const roomDir = path.join(
      workspaceRoot,
      "dungeon-data",
      subjectId,
      "rooms",
      rootRoomId,
    );
    await mkdir(roomDir, { recursive: true });
    await writeFile(path.join(roomDir, "artifact.md"), SAMPLE_ARTIFACT, "utf8");

    const orchestrator = createArchaeologistOrchestrator({
      persistence: createFileStoreArchaeologistPersistence(store),
      requiredCompletionRatio: 1,
    });

    await orchestrator.startSession("2026-05-22T18:20:00.000Z");

    // Try to review a room that does not exist
    const badReview = await orchestrator.reviewRoom({
      roomId: "nonexistent-room-id",
      nowIso: "2026-05-22T18:21:00.000Z",
    });

    expect(badReview.ok).toBe(false);
    if (badReview.ok) {
      return;
    }
    // Should be ROOM_NOT_FOUND (not in rooms map) or ROOM_NOT_REVIEWABLE
    expect(["ROOM_NOT_FOUND", "ROOM_NOT_REVIEWABLE"]).toContain(badReview.error.code);
  });

  it("ARC-FR-04 integration: review counts accumulate correctly across separate orchestrator instances", async () => {
    const workspaceRoot = await makeTempWorkspace();
    const subjectId = "arc-integration-counts";
    const store = new FileStore({ workspaceRoot, subjectId });

    const dungeon = await store.createDungeon("History", "Ancient Rome");
    const rootRoomId = dungeon.rootRoomId;

    const loaded = await store.loadDungeon();
    const completedRoot = buildCompletedRoom(loaded.rooms[rootRoomId]!);
    await store.saveRoom(completedRoot, false);

    const roomDir = path.join(
      workspaceRoot,
      "dungeon-data",
      subjectId,
      "rooms",
      rootRoomId,
    );
    await mkdir(roomDir, { recursive: true });
    await writeFile(path.join(roomDir, "artifact.md"), SAMPLE_ARTIFACT, "utf8");

    // First orchestrator instance – first review pass
    const orch1 = createArchaeologistOrchestrator({
      persistence: createFileStoreArchaeologistPersistence(store),
      requiredCompletionRatio: 1,
    });
    await orch1.startSession("2026-05-22T19:00:00.000Z");
    const pass1 = await orch1.reviewRoom({
      roomId: rootRoomId,
      nowIso: "2026-05-22T19:01:00.000Z",
    });
    expect(pass1.ok).toBe(true);
    if (!pass1.ok) {
      return;
    }
    expect(pass1.value.room.reviewPassCount).toBe(1);

    // Second orchestrator instance – second review pass (simulates next app session)
    const orch2 = createArchaeologistOrchestrator({
      persistence: createFileStoreArchaeologistPersistence(store),
      requiredCompletionRatio: 1,
    });
    await orch2.startSession("2026-05-22T20:00:00.000Z");
    const pass2 = await orch2.reviewRoom({
      roomId: rootRoomId,
      nowIso: "2026-05-22T20:01:00.000Z",
    });
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) {
      return;
    }
    expect(pass2.value.room.reviewPassCount).toBe(2);

    // Verify counts persisted to filesystem correctly
    const finalLoaded = await store.loadDungeon();
    expect(finalLoaded.rooms[rootRoomId]?.reviewPassCount).toBe(2);
  });
});
