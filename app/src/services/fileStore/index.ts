export {
  asPersistenceError,
  createSubjectIdFromName,
  FileStore,
  type FileStoreOptions,
  type LoadedSubject,
} from "./fileStore";
export {
  createSubjectBackup,
  pruneBackups,
  restoreSubjectBackup,
} from "./backups/backupService";
export { migrateDungeonIfNeeded } from "./migrations/migrationRunner";
export {
  buildSubjectPathContext,
  ensureSubjectStructure,
  resolveDungeonDataRoot,
  resolveDungeonFilePath,
  resolveRoomDirectory,
  resolveRoomMetadataPath,
  resolveRoomsDirectory,
  resolveSubjectDirectory,
  type SubjectPathContext,
} from "./paths";
