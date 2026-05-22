import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { toPersistenceError } from "@core/error-catalog";
import { sanitizePathFragment } from "@core/validation/persistence";

import {
  resolveDungeonDataRoot,
  resolveSubjectDirectory,
  type SubjectPathContext,
} from "@services/fileStore";

export interface ImportExportOptions {
  overwrite?: boolean;
}

async function copyDirectory(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

export async function exportSubjectFolder(
  context: SubjectPathContext,
  destinationRoot: string,
  options: ImportExportOptions = {},
): Promise<string> {
  const source = resolveSubjectDirectory(context);
  const destination = path.resolve(destinationRoot, context.subjectId);

  try {
    await mkdir(destinationRoot, { recursive: true });
    if (options.overwrite) {
      await rm(destination, { recursive: true, force: true });
    }

    await copyDirectory(source, destination);
    return destination;
  } catch (error) {
    throw toPersistenceError("IO_WRITE_FAILED", "Failed to export subject folder.", {
      source,
      destination,
      error,
    });
  }
}

export async function importSubjectFolder(
  workspaceRoot: string,
  sourceFolder: string,
  subjectId: string,
  options: ImportExportOptions = {},
): Promise<string> {
  const destinationRoot = resolveDungeonDataRoot(workspaceRoot);
  const destination = path.resolve(destinationRoot, sanitizePathFragment(subjectId));

  try {
    await mkdir(destinationRoot, { recursive: true });
    if (options.overwrite) {
      await rm(destination, { recursive: true, force: true });
    }

    await copyDirectory(sourceFolder, destination);
    return destination;
  } catch (error) {
    throw toPersistenceError("IO_WRITE_FAILED", "Failed to import subject folder.", {
      sourceFolder,
      destination,
      error,
    });
  }
}
