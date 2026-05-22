import { mkdir } from "node:fs/promises";
import path from "node:path";

import { toPersistenceError } from "@core/error-catalog";
import { type AppSettings } from "@core/validation/persistence";
import { readJsonFile, writeJsonFileAtomic } from "@services/fileStore/atomicIO";
import { resolveSettingsDirectory } from "@services/fileStore/paths";

const SETTINGS_FILE_NAME = "settings.json";
const SETTINGS_SCHEMA_VERSION = "1.0.0";

const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  theme: "cozy",
  textStyle: "serif",
  reducedMotion: false,
};

function resolveSettingsFilePath(workspaceRoot: string): string {
  return path.join(resolveSettingsDirectory(workspaceRoot), SETTINGS_FILE_NAME);
}

function isValidSettings(settings: AppSettings): boolean {
  const validTheme =
    settings.theme === "cozy" ||
    settings.theme === "classic" ||
    settings.theme === "high-contrast";
  const validTextStyle =
    settings.textStyle === "serif" ||
    settings.textStyle === "sans" ||
    settings.textStyle === "dyslexia-friendly";
  const validSchema = settings.schemaVersion === SETTINGS_SCHEMA_VERSION;

  return validTheme && validTextStyle && validSchema;
}

export async function loadAppSettings(workspaceRoot: string): Promise<AppSettings> {
  const filePath = resolveSettingsFilePath(workspaceRoot);

  try {
    const settings = await readJsonFile<AppSettings>(filePath);
    if (!isValidSettings(settings)) {
      throw toPersistenceError("SCHEMA_FIELD_INVALID", "Settings file is invalid.", settings);
    }

    return settings;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      await saveAppSettings(workspaceRoot, DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }

    throw error;
  }
}

export async function saveAppSettings(
  workspaceRoot: string,
  settings: AppSettings,
): Promise<void> {
  if (!isValidSettings(settings)) {
    throw toPersistenceError("SCHEMA_FIELD_INVALID", "Invalid app settings payload.", settings);
  }

  const settingsDirectory = resolveSettingsDirectory(workspaceRoot);
  const filePath = resolveSettingsFilePath(workspaceRoot);

  try {
    await mkdir(settingsDirectory, { recursive: true });
    await writeJsonFileAtomic(filePath, settings);
  } catch (error) {
    throw toPersistenceError("IO_WRITE_FAILED", "Failed to persist app settings.", error);
  }
}

export async function updateAppSettings(
  workspaceRoot: string,
  partial: Partial<Omit<AppSettings, "schemaVersion">>,
): Promise<AppSettings> {
  const current = await loadAppSettings(workspaceRoot);
  const merged: AppSettings = {
    ...current,
    ...partial,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
  };
  await saveAppSettings(workspaceRoot, merged);
  return merged;
}
