import { mkdtemp, mkdir, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  pruneBackups,
  type SubjectPathContext,
} from "@services/fileStore";

const createdTempDirs: string[] = [];

async function buildContext(): Promise<SubjectPathContext> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mindmap-dungeon-"));
  createdTempDirs.push(workspaceRoot);

  const subjectId = "biology-101";
  const backupRoot = path.join(workspaceRoot, "dungeon-data", subjectId, ".backups");
  await mkdir(backupRoot, { recursive: true });

  return {
    workspaceRoot,
    subjectId,
  };
}

describe("backup retention", () => {
  afterEach(async () => {
    await Promise.all(
      createdTempDirs.map(async (tempDir) => {
        await import("node:fs/promises").then(({ rm }) =>
          rm(tempDir, { recursive: true, force: true }),
        );
      }),
    );
    createdTempDirs.length = 0;
  });

  it("retains only the latest five snapshots", async () => {
    const context = await buildContext();
    const backupRoot = path.join(
      context.workspaceRoot,
      "dungeon-data",
      context.subjectId,
      ".backups",
    );

    const names = [
      "20260522010000--snapshot",
      "20260522020000--snapshot",
      "20260522030000--snapshot",
      "20260522040000--snapshot",
      "20260522050000--snapshot",
      "20260522060000--snapshot",
      "20260522070000--snapshot",
    ];

    await Promise.all(
      names.map(async (name) => {
        await mkdir(path.join(backupRoot, name), { recursive: true });
      }),
    );

    await pruneBackups(context, 5);

    const remaining = (await readdir(backupRoot)).sort();
    expect(remaining).toEqual([
      "20260522030000--snapshot",
      "20260522040000--snapshot",
      "20260522050000--snapshot",
      "20260522060000--snapshot",
      "20260522070000--snapshot",
    ]);
  });
});
