# Feature: Foundation

## Traceability

| Feature ID | Original PRD ID | Description |
|-----------|----------------|-------------|
| FND-US-01 | US-06 | Export/import dungeon folder data |
| FND-US-02 | US-08 | Customize NPC text style/theme |
| FND-FR-01 | DM-01, DM-02, DM-03 | Persist local dungeon data and keep graph metadata consistent while supporting import/export of subject folders |
| FND-FR-02 | CR-08 | Open/select an existing subject dungeon and resume work |
| FND-FR-03 | DM-04, DM-05, DM-09 | Surface recovery guidance, store attachments, manage backups, and retain recent snapshots |
| FND-FR-04 | DM-06, DM-07 | Enforce schema versioning and dungeon-level integrity constraints |
| FND-FR-05 | DM-08, DM-10, DM-11, DM-12, DM-13 | Validate room schema, strict enums, quality-bonus contract, stable error codes, and semver migration policy |

**Product Vision:** [docs/product-vision.md](../product-vision.md)  
**Original PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Foundation  
**ID Prefix:** FND  
**Summary:** Establish the local filesystem workspace, schema validation, import/export, backup, and migration systems that every other feature builds on.  
**Dependencies:** None  
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| FND-US-01 | structured note-taker | export/import dungeon folder data | I can back up and move my study projects | Should |
| FND-US-02 | solo student | customize NPC text style/theme | the experience feels personally engaging | Could |

---

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FND-FR-01 | System shall persist dungeon projects locally using a filesystem-backed folder structure and support import/export of subject folders without losing content. | Must |
| FND-FR-02 | System shall allow users to open/select an existing subject dungeon and resume from the last saved state. | Must |
| FND-FR-03 | System shall store and restore attachments and backup snapshots in subject-scoped locations while retaining the latest 5 backups. | Should |
| FND-FR-04 | System shall enforce schemaVersion, ULID identifiers, and dungeon-level integrity constraints on load/save. | Must |
| FND-FR-05 | System shall validate room metadata, strict enum membership, quality-bonus contract, and stable error-code mapping during persistence operations. | Must |

---

## 4. UI / Interaction Design

- Project picker screen for opening an existing subject folder or creating a new one.
- Import/export dialogs for copying dungeon folders into and out of local storage.
- Settings panel for lightweight personalization such as NPC text style/theme.
- Validation and migration warnings should be actionable and explain whether a backup was created.

---

## 5. Implementation Tasks

### Phase 1: Workspace Setup
- [ ] Create filesystem-backed subject folder structure and subject selection flow.
- [ ] Implement dungeon.json and room.json read/write helpers.
- [ ] Generate ULIDs for dungeons, rooms, and attachments.
- [ ] Add import/export plumbing for subject folders.

### Phase 2: Data Safety
- [ ] Implement schema validation, enum validation, and error-code emission.
- [ ] Add automatic backup creation before migration and critical writes.
- [ ] Implement migration restore/rollback behavior.
- [ ] Wire settings storage for lightweight app-wide customization.

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit Tests | Schema validation, ID generation, backup pruning, migration helpers | Deterministic fixture tests |
| Integration Tests | Read/write cycles, import/export roundtrips, resume existing subject flow | Temp directories and mocked file operations |

Key test scenarios:
1. Create a dungeon, save it, close it, and reopen it without losing metadata.
2. Import a dungeon folder and verify attachments and backups remain intact.
3. Trigger a migration and confirm a pre-migration backup is created.
4. Force a validation failure and confirm the correct stable error code is returned.

---

## 7. Acceptance Criteria

1. User can create, save, reopen, import, and export subject dungeon folders locally.
2. Schema validation rejects invalid room, dungeon, enum, and migration data before it corrupts the workspace.
3. Backups are created automatically and only the most recent 5 snapshots are retained per subject.
4. Attachments are preserved during load/save and survive import/export.
5. Personalization settings can be changed and persisted locally.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Should import/export allow overwriting an existing subject folder in place? | Require explicit overwrite confirmation |
| 2 | Should theme customization apply globally or per subject dungeon? | Global by default, with per-subject override deferred |
