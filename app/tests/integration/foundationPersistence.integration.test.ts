import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FileStore,
  buildSubjectPathContext,
  resolveRoomDirectory,
} from "@services/fileStore";
import {
  exportSubjectFolder,
  importSubjectFolder,
} from "@services/importExport";
import {
  loadAppSettings,
  saveAppSettings,
  updateAppSettings,
} from "@services/settings";

const createdTempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  createdTempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    createdTempDirs.map(async (tempDir) => {
      await rm(tempDir, { recursive: true, force: true });
    }),
  );
  createdTempDirs.length = 0;
});

describe("foundation persistence integration", () => {
  it("FND-FR-01 reopens a saved subject and supports import/export roundtrip", async () => {
    const workspaceA = await makeTempDir("mindmap-dungeon-a-");
    const workspaceB = await makeTempDir("mindmap-dungeon-b-");
    const exportRoot = await makeTempDir("mindmap-dungeon-export-");

    const subjectId = "biology-101";
    const storeA = new FileStore({ workspaceRoot: workspaceA, subjectId });

    const createdDungeon = await storeA.createDungeon("Biology 101", "Cells");
    const roomId = createdDungeon.rootRoomId;
    await storeA.saveRoomNote(roomId, "Cell notes with deterministic content.");
    await storeA.saveRoomArtifact(roomId, "# Cell Artifact\n\nReview summary.");

    const reopened = await new FileStore({ workspaceRoot: workspaceA, subjectId }).loadDungeon();
    expect(reopened.dungeon.dungeonId).toBe(createdDungeon.dungeonId);
    expect(Object.keys(reopened.rooms)).toEqual([roomId]);
    expect(await storeA.readRoomNote(roomId)).toContain("deterministic");

    const exportedPath = await exportSubjectFolder(
      buildSubjectPathContext(workspaceA, subjectId),
      exportRoot,
    );

    await importSubjectFolder(workspaceB, exportedPath, subjectId);
    const imported = await new FileStore({
      workspaceRoot: workspaceB,
      subjectId,
    }).loadDungeon();

    expect(imported.dungeon).toMatchObject({
      dungeonId: createdDungeon.dungeonId,
      rootRoomId: roomId,
      subjectName: "Biology 101",
    });

    const importedStore = new FileStore({ workspaceRoot: workspaceB, subjectId });
    expect(await importedStore.readRoomNote(roomId)).toContain("deterministic");

    const importedArtifactPath = path.join(
      workspaceB,
      "dungeon-data",
      subjectId,
      "rooms",
      roomId,
      "artifact.md",
    );
    expect(await readFile(importedArtifactPath, "utf8")).toContain("Cell Artifact");
  });

  it("FND-FR-03 and FND-FR-04 preserve attachment metadata/files across import/export", async () => {
    const workspaceA = await makeTempDir("mindmap-dungeon-attach-a-");
    const workspaceB = await makeTempDir("mindmap-dungeon-attach-b-");
    const exportRoot = await makeTempDir("mindmap-dungeon-attach-export-");

    const subjectId = "chemistry-201";
    const storeA = new FileStore({ workspaceRoot: workspaceA, subjectId });
    const dungeon = await storeA.createDungeon("Chemistry 201", "Atoms");
    const room = await storeA.loadRoom(dungeon.rootRoomId);

    const attachmentId = FileStore.generateAttachmentId();
    const relativePath = "attachments/diagram.txt";

    room.attachments.push({
      attachmentId,
      fileName: "diagram.txt",
      mimeType: "text/plain",
      relativePath,
      addedAt: new Date("2026-05-22T12:00:00.000Z").toISOString(),
    });

    await storeA.saveRoom(room, false);

    const roomDirectory = resolveRoomDirectory(
      buildSubjectPathContext(workspaceA, subjectId),
      room.roomId,
    );
    const attachmentDirectory = path.join(roomDirectory, "attachments");
    await mkdir(attachmentDirectory, { recursive: true });
    await writeFile(path.join(roomDirectory, relativePath), "binary-placeholder", "utf8");

    const exportedPath = await exportSubjectFolder(
      buildSubjectPathContext(workspaceA, subjectId),
      exportRoot,
    );
    await importSubjectFolder(workspaceB, exportedPath, subjectId);

    const storeB = new FileStore({ workspaceRoot: workspaceB, subjectId });
    const importedRoom = await storeB.loadRoom(room.roomId);

    expect(importedRoom.attachments).toEqual(room.attachments);

    const importedAttachmentPath = path.join(
      workspaceB,
      "dungeon-data",
      subjectId,
      "rooms",
      room.roomId,
      relativePath,
    );
    expect(await readFile(importedAttachmentPath, "utf8")).toBe("binary-placeholder");
  });

  it("FND-FR-03 auto-creates backups on writes and retains latest five", async () => {
    const workspace = await makeTempDir("mindmap-dungeon-backups-");
    const subjectId = "physics-301";
    const store = new FileStore({ workspaceRoot: workspace, subjectId });

    const dungeon = await store.createDungeon("Physics 301", "Motion");
    const roomId = dungeon.rootRoomId;

    vi.useFakeTimers();

    const baseTime = Date.parse("2026-05-22T00:00:00.000Z");
    for (let i = 0; i < 7; i += 1) {
      vi.setSystemTime(new Date(baseTime + i * 1000));
      await store.saveRoomNote(roomId, `note-${i}`);
    }

    const backupDirectory = path.join(
      workspace,
      "dungeon-data",
      subjectId,
      ".backups",
    );
    const snapshots = (await readdir(backupDirectory)).sort();

    expect(snapshots).toHaveLength(5);
  });
});

describe("foundation settings integration", () => {
  it("FND-FR-05 persists personalization settings locally", async () => {
    const workspace = await makeTempDir("mindmap-dungeon-settings-");

    await saveAppSettings(workspace, {
      schemaVersion: "1.0.0",
      theme: "cozy",
      textStyle: "serif",
      reducedMotion: false,
    });

    const updated = await updateAppSettings(workspace, {
      theme: "high-contrast",
      textStyle: "dyslexia-friendly",
      reducedMotion: true,
    });

    expect(updated).toMatchObject({
      theme: "high-contrast",
      textStyle: "dyslexia-friendly",
      reducedMotion: true,
    });

    const reloaded = await loadAppSettings(workspace);
    expect(reloaded).toEqual(updated);

    const persistedFilePath = path.join(workspace, ".mindmap-dungeon", "settings.json");
    const persistedRaw = await readFile(persistedFilePath, "utf8");
    expect(persistedRaw).toContain("high-contrast");
  });
});
