import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { toPersistenceError } from "@core/error-catalog";

export async function readUtf8File(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw toPersistenceError("IO_READ_FAILED", `Failed to read ${filePath}.`, error);
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readUtf8File(filePath);
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw toPersistenceError("SCHEMA_FIELD_INVALID", `Invalid JSON at ${filePath}.`, error);
  }
}

export async function writeUtf8FileAtomic(filePath: string, content: string): Promise<void> {
  const directory = path.dirname(filePath);
  const tempFile = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(tempFile, content, "utf8");
    await rename(tempFile, filePath);
  } catch (error) {
    throw toPersistenceError("IO_WRITE_FAILED", `Failed to write ${filePath}.`, error);
  }
}

export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  await writeUtf8FileAtomic(filePath, serialized);
}
