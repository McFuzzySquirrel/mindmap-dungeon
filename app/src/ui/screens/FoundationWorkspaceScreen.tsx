import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  FileStore,
  buildSubjectPathContext,
  createSubjectIdFromName,
} from "@services/fileStore";
import { exportSubjectFolder, importSubjectFolder } from "@services/importExport";
import {
  loadAppSettings,
  updateAppSettings,
} from "@services/settings";
import { type AppSettings, type PhaseState } from "@core/validation/persistence";

import { buildActionableWarning, type ActionableWarning } from "./foundationWarnings";

interface ActiveSubjectSummary {
  subjectId: string;
  subjectName: string;
  phaseState: PhaseState;
  updatedAt: string;
}

const DEFAULT_WORKSPACE_ROOT = ".";

export function FoundationWorkspaceScreen(): JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(DEFAULT_WORKSPACE_ROOT);
  const [subjectName, setSubjectName] = useState<string>("");
  const [rootTopic, setRootTopic] = useState<string>("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [activeSubject, setActiveSubject] = useState<ActiveSubjectSummary | null>(null);

  const [importSourceFolder, setImportSourceFolder] = useState<string>("");
  const [importSubjectId, setImportSubjectId] = useState<string>("");
  const [importOverwrite, setImportOverwrite] = useState<boolean>(false);

  const [exportDestinationRoot, setExportDestinationRoot] = useState<string>("");
  const [exportOverwrite, setExportOverwrite] = useState<boolean>(false);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [warning, setWarning] = useState<ActionableWarning | null>(null);
  const [pendingOverwriteAction, setPendingOverwriteAction] = useState<
    "import" | "export" | null
  >(null);

  const selectedSubjectForExport = selectedSubjectId || activeSubject?.subjectId || "";

  const loadWorkspaceData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [subjectIds, loadedSettings] = await Promise.all([
        FileStore.listSubjects(workspaceRoot),
        loadAppSettings(workspaceRoot),
      ]);
      setSubjects(subjectIds);
      if (!selectedSubjectId && subjectIds.length > 0) {
        const firstSubjectId = subjectIds[0];
        if (firstSubjectId) {
          setSelectedSubjectId(firstSubjectId);
        }
      }
      setSettings(loadedSettings);
      setWarning(null);
    } catch (error) {
      setWarning(buildActionableWarning(error, "Could not load workspace data"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubjectId, workspaceRoot]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    document.body.dataset.motion = settings.reducedMotion ? "reduced" : "default";
  }, [settings]);

  const formattedActiveState = useMemo(() => {
    if (!activeSubject) {
      return "No subject loaded.";
    }

    return `Loaded ${activeSubject.subjectName} (${activeSubject.subjectId}) at phase ${activeSubject.phaseState}. Last updated ${new Date(activeSubject.updatedAt).toLocaleString()}.`;
  }, [activeSubject]);

  const updateTheme = useCallback(
    async (theme: AppSettings["theme"]) => {
      try {
        const updated = await updateAppSettings(workspaceRoot, { theme });
        setSettings(updated);
        setStatusMessage(`Theme saved: ${updated.theme}`);
        setWarning(null);
      } catch (error) {
        setWarning(buildActionableWarning(error, "Could not save theme setting"));
      }
    },
    [workspaceRoot],
  );

  const updateTextStyle = useCallback(
    async (textStyle: AppSettings["textStyle"]) => {
      try {
        const updated = await updateAppSettings(workspaceRoot, { textStyle });
        setSettings(updated);
        setStatusMessage(`NPC text style saved: ${updated.textStyle}`);
        setWarning(null);
      } catch (error) {
        setWarning(buildActionableWarning(error, "Could not save text style"));
      }
    },
    [workspaceRoot],
  );

  const updateReducedMotion = useCallback(
    async (reducedMotion: boolean) => {
      try {
        const updated = await updateAppSettings(workspaceRoot, { reducedMotion });
        setSettings(updated);
        setStatusMessage(
          `Reduced motion ${updated.reducedMotion ? "enabled" : "disabled"}.`,
        );
        setWarning(null);
      } catch (error) {
        setWarning(buildActionableWarning(error, "Could not save reduced-motion setting"));
      }
    },
    [workspaceRoot],
  );

  const handleCreateSubject = useCallback(async () => {
    if (!subjectName.trim() || !rootTopic.trim()) {
      setWarning({
        title: "Missing project details",
        message: "Subject name and root topic are required.",
        remediation: "Provide both fields to create a new dungeon subject.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const generatedSubjectId = createSubjectIdFromName(subjectName);
      const fileStore = new FileStore({
        workspaceRoot,
        subjectId: generatedSubjectId,
      });
      const dungeon = await fileStore.createDungeon(subjectName.trim(), rootTopic.trim());
      setSubjects((current) => Array.from(new Set([...current, generatedSubjectId])).sort());
      setSelectedSubjectId(generatedSubjectId);
      setActiveSubject({
        subjectId: generatedSubjectId,
        subjectName: dungeon.subjectName,
        phaseState: dungeon.phaseState,
        updatedAt: dungeon.updatedAt,
      });
      setSubjectName("");
      setRootTopic("");
      setStatusMessage(`Created and loaded subject: ${generatedSubjectId}`);
      setWarning(null);
    } catch (error) {
      setWarning(buildActionableWarning(error, "Could not create subject"));
    } finally {
      setIsLoading(false);
    }
  }, [rootTopic, subjectName, workspaceRoot]);

  const handleOpenSubject = useCallback(async () => {
    const subjectId = selectedSubjectId.trim();
    if (!subjectId) {
      setWarning({
        title: "No subject selected",
        message: "Select a subject from the list to resume state.",
        remediation: "Choose an existing subject ID and try again.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const fileStore = new FileStore({ workspaceRoot, subjectId });
      const loaded = await fileStore.loadDungeon();
      setActiveSubject({
        subjectId,
        subjectName: loaded.dungeon.subjectName,
        phaseState: loaded.dungeon.phaseState,
        updatedAt: loaded.dungeon.updatedAt,
      });
      setStatusMessage(`Resumed subject ${subjectId} at ${loaded.dungeon.phaseState}.`);
      setWarning(null);
    } catch (error) {
      setWarning(buildActionableWarning(error, "Could not open selected subject"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubjectId, workspaceRoot]);

  const runImport = useCallback(
    async (confirmedOverwrite: boolean) => {
      if (!importSourceFolder.trim() || !importSubjectId.trim()) {
        setWarning({
          title: "Import fields required",
          message: "Import source folder and target subject ID are required.",
          remediation: "Fill both fields, then retry import.",
        });
        return;
      }

      if (importOverwrite && !confirmedOverwrite) {
        setPendingOverwriteAction("import");
        setWarning({
          title: "Overwrite confirmation required",
          message: "Import overwrite is enabled and may replace an existing subject folder.",
          remediation: "Use Confirm Import Overwrite to continue, or disable overwrite.",
        });
        return;
      }

      setPendingOverwriteAction(null);
      setIsLoading(true);
      try {
        await importSubjectFolder(workspaceRoot, importSourceFolder, importSubjectId, {
          overwrite: importOverwrite,
        });
        await loadWorkspaceData();
        setSelectedSubjectId(importSubjectId);
        setStatusMessage(`Imported subject folder as ${importSubjectId}.`);
        setWarning(null);
      } catch (error) {
        setWarning(buildActionableWarning(error, "Import failed"));
      } finally {
        setIsLoading(false);
      }
    },
    [importOverwrite, importSourceFolder, importSubjectId, loadWorkspaceData, workspaceRoot],
  );

  const runExport = useCallback(
    async (confirmedOverwrite: boolean) => {
      const subjectId = selectedSubjectForExport.trim();
      if (!subjectId || !exportDestinationRoot.trim()) {
        setWarning({
          title: "Export fields required",
          message: "Choose a subject and destination root before export.",
          remediation: "Select a subject ID and destination path, then retry export.",
        });
        return;
      }

      if (exportOverwrite && !confirmedOverwrite) {
        setPendingOverwriteAction("export");
        setWarning({
          title: "Overwrite confirmation required",
          message: "Export overwrite is enabled and may replace an existing folder at destination.",
          remediation: "Use Confirm Export Overwrite to continue, or disable overwrite.",
        });
        return;
      }

      setPendingOverwriteAction(null);
      setIsLoading(true);
      try {
        const context = buildSubjectPathContext(workspaceRoot, subjectId);
        const destination = await exportSubjectFolder(context, exportDestinationRoot, {
          overwrite: exportOverwrite,
        });
        setStatusMessage(`Exported ${subjectId} to ${destination}.`);
        setWarning(null);
      } catch (error) {
        setWarning(buildActionableWarning(error, "Export failed"));
      } finally {
        setIsLoading(false);
      }
    },
    [exportDestinationRoot, exportOverwrite, selectedSubjectForExport, workspaceRoot],
  );

  return (
    <div className="foundation-shell">
      <header className="foundation-header" aria-live="polite">
        <h1>Mindmap Dungeon Foundation</h1>
        <p>
          Create, open, import, and export subject dungeons while keeping local settings
          and recovery guidance visible.
        </p>
      </header>

      <main className="foundation-grid" aria-label="Foundation setup workspace">
        <section className="foundation-card" aria-labelledby="workspace-root-heading">
          <h2 id="workspace-root-heading">Workspace Root</h2>
          <label htmlFor="workspace-root-input">Workspace path</label>
          <input
            id="workspace-root-input"
            value={workspaceRoot}
            onChange={(event) => setWorkspaceRoot(event.target.value)}
            placeholder="/path/to/workspace"
          />
          <button type="button" onClick={() => void loadWorkspaceData()} disabled={isLoading}>
            Refresh Workspace
          </button>
        </section>

        <section className="foundation-card" aria-labelledby="project-picker-heading">
          <h2 id="project-picker-heading">Project Picker</h2>
          <p className="helper-text">
            Create a new subject dungeon or open an existing one and resume phase state.
          </p>

          <div className="field-grid" role="group" aria-label="Create subject dungeon">
            <label htmlFor="subject-name-input">Subject name</label>
            <input
              id="subject-name-input"
              value={subjectName}
              onChange={(event) => setSubjectName(event.target.value)}
              placeholder="Biology 101"
            />

            <label htmlFor="root-topic-input">Root topic</label>
            <input
              id="root-topic-input"
              value={rootTopic}
              onChange={(event) => setRootTopic(event.target.value)}
              placeholder="Cell Theory"
            />

            <button type="button" onClick={() => void handleCreateSubject()} disabled={isLoading}>
              Create Subject
            </button>
          </div>

          <div className="field-grid" role="group" aria-label="Open existing subject">
            <label htmlFor="subject-select">Existing subject IDs</label>
            <select
              id="subject-select"
              value={selectedSubjectId}
              onChange={(event) => setSelectedSubjectId(event.target.value)}
            >
              <option value="">Select a subject</option>
              {subjects.map((subjectId) => (
                <option key={subjectId} value={subjectId}>
                  {subjectId}
                </option>
              ))}
            </select>

            <button type="button" onClick={() => void handleOpenSubject()} disabled={isLoading}>
              Open and Resume
            </button>
          </div>

          <p className="status-text" aria-live="polite">
            {formattedActiveState}
          </p>
        </section>

        <section className="foundation-card" aria-labelledby="import-export-heading">
          <h2 id="import-export-heading">Import / Export</h2>

          <div className="field-grid" role="group" aria-label="Import subject dungeon">
            <h3>Import</h3>
            <label htmlFor="import-source-input">Source folder path</label>
            <input
              id="import-source-input"
              value={importSourceFolder}
              onChange={(event) => setImportSourceFolder(event.target.value)}
              placeholder="/path/to/exported-subject"
            />

            <label htmlFor="import-subject-id-input">Target subject ID</label>
            <input
              id="import-subject-id-input"
              value={importSubjectId}
              onChange={(event) => setImportSubjectId(event.target.value)}
              placeholder="biology-101-a1b2c3"
            />

            <label className="checkbox-row" htmlFor="import-overwrite-checkbox">
              <input
                id="import-overwrite-checkbox"
                type="checkbox"
                checked={importOverwrite}
                onChange={(event) => setImportOverwrite(event.target.checked)}
              />
              Overwrite if target subject exists
            </label>

            <button type="button" onClick={() => void runImport(false)} disabled={isLoading}>
              Import Subject Folder
            </button>

            {pendingOverwriteAction === "import" ? (
              <button
                type="button"
                className="warning-action"
                onClick={() => void runImport(true)}
                disabled={isLoading}
              >
                Confirm Import Overwrite
              </button>
            ) : null}
          </div>

          <div className="field-grid" role="group" aria-label="Export subject dungeon">
            <h3>Export</h3>
            <label htmlFor="export-subject-id">Subject ID to export</label>
            <input id="export-subject-id" value={selectedSubjectForExport} readOnly />

            <label htmlFor="export-destination-input">Destination root path</label>
            <input
              id="export-destination-input"
              value={exportDestinationRoot}
              onChange={(event) => setExportDestinationRoot(event.target.value)}
              placeholder="/path/to/exports"
            />

            <label className="checkbox-row" htmlFor="export-overwrite-checkbox">
              <input
                id="export-overwrite-checkbox"
                type="checkbox"
                checked={exportOverwrite}
                onChange={(event) => setExportOverwrite(event.target.checked)}
              />
              Overwrite destination folder if present
            </label>

            <button type="button" onClick={() => void runExport(false)} disabled={isLoading}>
              Export Subject Folder
            </button>

            {pendingOverwriteAction === "export" ? (
              <button
                type="button"
                className="warning-action"
                onClick={() => void runExport(true)}
                disabled={isLoading}
              >
                Confirm Export Overwrite
              </button>
            ) : null}
          </div>
        </section>

        <section className="foundation-card" aria-labelledby="settings-heading">
          <h2 id="settings-heading">Personalization Settings</h2>
          <p className="helper-text">
            Theme and NPC text style are persisted locally using the settings store.
          </p>

          <div className="field-grid" role="group" aria-label="Theme setting">
            <label htmlFor="theme-select">Theme</label>
            <select
              id="theme-select"
              value={settings?.theme ?? "cozy"}
              onChange={(event) =>
                void updateTheme(event.target.value as AppSettings["theme"])
              }
              disabled={!settings || isLoading}
            >
              <option value="cozy">Cozy</option>
              <option value="classic">Classic</option>
              <option value="high-contrast">High Contrast</option>
            </select>

            <label htmlFor="text-style-select">NPC text style</label>
            <select
              id="text-style-select"
              value={settings?.textStyle ?? "serif"}
              onChange={(event) =>
                void updateTextStyle(event.target.value as AppSettings["textStyle"])
              }
              disabled={!settings || isLoading}
            >
              <option value="serif">Serif</option>
              <option value="sans">Sans</option>
              <option value="dyslexia-friendly">Dyslexia-friendly</option>
            </select>

            <label className="checkbox-row" htmlFor="reduced-motion-checkbox">
              <input
                id="reduced-motion-checkbox"
                type="checkbox"
                checked={settings?.reducedMotion ?? false}
                onChange={(event) => void updateReducedMotion(event.target.checked)}
                disabled={!settings || isLoading}
              />
              Reduce major transition motion
            </label>
          </div>
        </section>

        <section className="foundation-card" aria-labelledby="warnings-heading">
          <h2 id="warnings-heading">Warnings and Recovery</h2>
          {warning ? (
            <div className="warning-surface" role="alert" aria-live="assertive">
              <h3>{warning.title}</h3>
              <p>{warning.message}</p>
              <p>
                <strong>Action:</strong> {warning.remediation}
              </p>
              {warning.code ? (
                <p>
                  <strong>Error code:</strong> {warning.code}
                </p>
              ) : null}
              {warning.backupGuidance ? (
                <p>
                  <strong>Backup guidance:</strong> {warning.backupGuidance}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="status-text">No active warnings.</p>
          )}

          <div className="status-surface" aria-live="polite">
            <h3>Recent status</h3>
            <p>{statusMessage || "No recent actions."}</p>
          </div>
        </section>
      </main>
    </div>
  );
}