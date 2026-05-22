import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  addLinkedRoomsToCreatorState,
  initializeCreatorState,
  markCreatorRoomVisited,
} from "@features/creator";
import { FileStore } from "@services/fileStore";

type LinkedMutationResult = ReturnType<typeof addLinkedRoomsToCreatorState>;

const tempDirs: string[] = [];

async function makeTempWorkspace(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mindmap-dungeon-creator-"));
  tempDirs.push(dir);
  return dir;
}

async function persistCreatorMutation(
  store: FileStore,
  result: LinkedMutationResult,
): Promise<void> {
  if (!result.ok) {
    throw new Error(`Expected creator mutation to succeed: ${result.error.message}`);
  }

  const changedIds = new Set<string>([
    ...result.value.summary.touchedRoomIds,
    ...result.value.summary.revalidationRevokedRoomIds,
  ]);

  await store.saveDungeon(result.value.state.dungeon, false);
  for (const roomId of changedIds) {
    const room = result.value.state.rooms[roomId];
    if (!room) {
      continue;
    }
    await store.saveRoom(room, false);
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }),
  );
  tempDirs.length = 0;
});

describe("creator dungeon integration", () => {
  it("CRT-FR-01/02 creates root then expands into linked rooms and persists workflow state", async () => {
    const workspaceRoot = await makeTempWorkspace();
    const subjectId = "creator-integration-1";
    const store = new FileStore({ workspaceRoot, subjectId });

    const dungeon = await store.createDungeon("Biology 101", "Cells");
    const loaded = await store.loadDungeon();

    const initialized = initializeCreatorState({ loadedSubject: loaded });
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) {
      return;
    }

    const mitosisRoomId = FileStore.generateRoomId();
    const organellesRoomId = FileStore.generateRoomId();

    const expanded = addLinkedRoomsToCreatorState(initialized.value, {
      fromRoomId: dungeon.rootRoomId,
      drafts: [
        { roomId: mitosisRoomId, topic: "Mitosis", relationType: "subtopic" },
        { roomId: organellesRoomId, topic: "Cell Organelles", relationType: "related" },
      ],
      nowIso: "2026-05-22T12:00:00.000Z",
    });

    expect(expanded.ok).toBe(true);
    if (!expanded.ok) {
      return;
    }

    await persistCreatorMutation(store, expanded);

    const reopened = await store.loadDungeon();
    const initializedAgain = initializeCreatorState({ loadedSubject: reopened });
    expect(initializedAgain.ok).toBe(true);
    if (!initializedAgain.ok) {
      return;
    }

    expect(reopened.dungeon.rooms.map((room) => room.roomId).sort()).toEqual(
      [dungeon.rootRoomId, mitosisRoomId, organellesRoomId].sort(),
    );

    expect(
      reopened.dungeon.edges.map((edge) => `${edge.fromRoomId}->${edge.toRoomId}:${edge.relationType}`),
    ).toContain(`${dungeon.rootRoomId}->${mitosisRoomId}:subtopic`);
    expect(
      reopened.dungeon.edges.map((edge) => `${edge.fromRoomId}->${edge.toRoomId}:${edge.relationType}`),
    ).toContain(`${dungeon.rootRoomId}->${organellesRoomId}:related`);

    expect(initializedAgain.value.guidance.unresolvedRoomIds.sort()).toEqual(
      [mitosisRoomId, organellesRoomId].sort(),
    );
  });

  it("CRT-FR-01/05 resumes an existing subject and restores creator progress state", async () => {
    const workspaceRoot = await makeTempWorkspace();
    const subjectId = "creator-integration-2";
    const store = new FileStore({ workspaceRoot, subjectId });

    const dungeon = await store.createDungeon("Physics 101", "Motion");

    const loaded = await store.loadDungeon();
    const initialized = initializeCreatorState({ loadedSubject: loaded });
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) {
      return;
    }

    const velocityRoomId = FileStore.generateRoomId();

    const expanded = addLinkedRoomsToCreatorState(initialized.value, {
      fromRoomId: dungeon.rootRoomId,
      drafts: [{ roomId: velocityRoomId, topic: "Velocity" }],
      nowIso: "2026-05-22T12:05:00.000Z",
    });
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) {
      return;
    }

    await persistCreatorMutation(store, expanded);

    const markedVisited = markCreatorRoomVisited(expanded.value.state, velocityRoomId);
    expect(markedVisited.ok).toBe(true);
    if (!markedVisited.ok) {
      return;
    }

    await store.saveDungeon(markedVisited.value.dungeon, false);
    const velocityRoom = markedVisited.value.rooms[velocityRoomId];
    expect(velocityRoom).toBeDefined();
    if (!velocityRoom) {
      return;
    }

    await store.saveRoom(velocityRoom, false);

    const resumed = await new FileStore({ workspaceRoot, subjectId }).loadDungeon();
    const resumedState = initializeCreatorState({ loadedSubject: resumed });

    expect(resumedState.ok).toBe(true);
    if (!resumedState.ok) {
      return;
    }

    const resumedRoom = resumedState.value.dungeon.rooms.find((room) => room.roomId === velocityRoomId);
    expect(resumedRoom?.status).toBe("Visited");

    expect(resumedState.value.guidance.visitedRoomIds).toContain(velocityRoomId);
    expect(resumedState.value.guidance.unresolvedRoomIds).toEqual([velocityRoomId]);
  });
});
