import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createFileStoreScribePersistence,
  createScribeOrchestrator,
} from "@features/scribe";
import { FileStore } from "@services/fileStore";

const createdTempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  createdTempDirs.push(dir);
  return dir;
}

function buildShortFailingNote(): string {
  return [
    "Summary",
    "A brief start.",
    "",
    "Key Points",
    "Not enough detail yet.",
  ].join("\n");
}

function buildPassingNote(): string {
  return [
    "Summary",
    Array.from({ length: 45 }, (_, i) => `summary${i + 1}`).join(" "),
    "",
    "Key Points",
    Array.from({ length: 45 }, (_, i) => `points${i + 1}`).join(" "),
    "",
    "Recall Question",
    `How do ${Array.from({ length: 40 }, (_, i) => `recall${i + 1}`).join(" ")} connect in practice?`,
    "See also [[retrieval-practice]] and [[spaced-repetition]].",
  ].join("\n");
}

afterEach(async () => {
  await Promise.all(
    createdTempDirs.map(async (tempDir) => {
      await rm(tempDir, { recursive: true, force: true });
    }),
  );
  createdTempDirs.length = 0;
});

describe("scribe encounters integration", () => {
  it("SCR-FR-03/SCR-FR-04 clear-fail-retry flow preserves draft and clears room after correction", async () => {
    const workspaceRoot = await makeTempDir("mindmap-dungeon-scribe-");
    const subjectId = "scribe-integration-1";
    const store = new FileStore({ workspaceRoot, subjectId });

    const dungeon = await store.createDungeon("Biology 101", "Cells");
    const roomId = dungeon.rootRoomId;

    const orchestrator = createScribeOrchestrator({
      persistence: createFileStoreScribePersistence(store),
    });

    const initialized = orchestrator.initialize({
      loadedSubject: await store.loadDungeon(),
      nowIso: "2026-05-22T15:00:00.000Z",
    });

    expect(initialized.ok).toBe(true);
    if (!initialized.ok) {
      return;
    }
    expect(initialized.value.encountersByRoomId[roomId]?.encounterRequired).toBe(true);

    const failingNote = buildShortFailingNote();
    const failedAttempt = await orchestrator.submitEncounterNote({
      roomId,
      noteText: failingNote,
      manualConfirmed: false,
      nowIso: "2026-05-22T15:05:00.000Z",
    });

    expect(failedAttempt.ok).toBe(true);
    if (!failedAttempt.ok) {
      return;
    }

    expect(failedAttempt.value.validation.finalPass).toBe(false);
    expect(failedAttempt.value.validation.failedChecks).toEqual(
      expect.arrayContaining([
        "VAL_WORD_COUNT_TOO_LOW",
        "VAL_REQUIRED_SECTION_MISSING",
        "VAL_MANUAL_CONFIRM_REQUIRED",
      ]),
    );
    expect(failedAttempt.value.room.state).toBe("NotesDrafted");
    expect(await store.readRoomNote(roomId)).toBe(failingNote);

    const retryAttempt = await orchestrator.submitEncounterNote({
      roomId,
      noteText: buildPassingNote(),
      manualConfirmed: true,
      nowIso: "2026-05-22T15:10:00.000Z",
      referenceTerms: ["cells", "organelles", "membrane"],
    });

    expect(retryAttempt.ok).toBe(true);
    if (!retryAttempt.ok) {
      return;
    }

    expect(retryAttempt.value.validation.finalPass).toBe(true);
    expect(retryAttempt.value.room.state).toBe("EncounterDefeated");
    expect(retryAttempt.value.artifact).toBeDefined();

    const reopened = await store.loadDungeon();
    expect(reopened.dungeon.rooms[0]?.status).toBe("EncounterDefeated");
    expect(reopened.rooms[roomId]?.state).toBe("EncounterDefeated");

    const artifactPath = path.join(
      workspaceRoot,
      "dungeon-data",
      subjectId,
      "rooms",
      roomId,
      "artifact.md",
    );
    const artifactText = await readFile(artifactPath, "utf8");
    expect(artifactText).toContain("# Scribe Artifact");
    expect(artifactText).toContain("Quality Bonus:");
  });
});
