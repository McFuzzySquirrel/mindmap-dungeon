# Mindmap Dungeon

## 1. Overview

**Product Name:** Mindmap Dungeon  
**Summary:** A local-first desktop learning game where a solo student transforms a subject into a traversable dungeon, writes structured notes to conquer topic encounters, and later revisits the dungeon for high-recall exam preparation.  
**Target Platform:** Desktop application (Linux, macOS, Windows) using Tauri shell + web UI.  
**Key Constraints:** Local-only storage in filesystem folders/JSON, offline-first behavior, deterministic progression logic (no cloud AI dependency), three-phase sequential experience.

---

## 2. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-21 | GitHub Copilot | Initial PRD |
| 1.1 | 2026-05-21 | GitHub Copilot | Gameplay balance pass: explicit note gate, XP model, badge thresholds |
| 1.2 | 2026-05-22 | GitHub Copilot | Gap review pass: component-level acceptance coverage and doc hygiene |

Track document revisions so readers know what changed and when.

---

## 3. Goals and Non-Goals

### 3.1 Goals
- Improve learner recall before exams through repeated spatial/topic traversal.
- Convert mindmap creation into an engaging, room-based progression loop.
- Require concise, structured note-writing per topic to reinforce comprehension.
- Enable review mode that reuses previously created artifacts for rapid revision.
- Reward completion with subject-level XP and badges to sustain motivation.

### 3.2 Non-Goals
- Multiplayer, co-op, or shared dungeon experiences in v1.
- Cloud sync, remote accounts, and server-side storage in v1.
- AI-generated note content or AI-based grading in v1.
- Teacher assignment and classroom orchestration workflows in v1.
- Mobile-first release in v1.

---

## 4. User Stories / Personas

### 4.1 Personas

| Persona | Description | Key Needs |
|---------|-------------|-----------|
| Solo Student (Primary) | Independent learner preparing for exams in one or more subjects | Build clear topic structure, write effective notes, review quickly before tests |
| Structured Note-Taker | Learner who values organized notes and progress tracking | Standardized note format, visible completion state, easy revisit of prior work |
| Last-Minute Reviewer | Learner doing high-intensity revision close to exam date | Fast navigation, artifact collection/readback, lightweight recall prompts |

### 4.2 User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| US-01 | solo student | create a root topic and linked subtopics by moving room-to-room | my subject structure becomes a playable map | Must |
| US-02 | solo student | add cross-links between existing topics | I can model non-tree relationships | Must |
| US-03 | structured note-taker | defeat room encounters by submitting notes that pass rules | I am pushed to produce useful revision notes | Must |
| US-04 | last-minute reviewer | revisit the completed dungeon and read collected artifacts | I can rapidly review before an exam | Must |
| US-05 | solo student | receive XP and badges by phase and subject | I stay motivated and can track progress | Should |
| US-06 | structured note-taker | export/import dungeon folder data | I can back up and move my study projects | Should |
| US-07 | last-minute reviewer | use short self-check prompts in review mode | I can test recall without full quiz overhead | Should |
| US-08 | solo student | customize NPC text style/theme | the experience feels personally engaging | Could |

---

## 5. Research Findings

Technology and ecosystem checks were performed on 2026-05-21.

- Tauri v2 is current; latest observed release line includes 2.11.x.
- React docs indicate latest major/minor stream is 19.2, with 19.2.x patches.
- Vite latest stable observed is 8.0.x; docs include migration guidance from v7.
- TypeScript 6.0 is documented as a transition release with important deprecations.

### 5.1 Technology choice rationale

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Tauri + React + Vite + TypeScript | Lightweight desktop binary, strong local FS integration, modern frontend tooling | Requires Rust toolchain and OS-specific setup | Selected |
| Electron + React | Mature ecosystem, easier JS-only onboarding | Higher memory footprint and larger binaries | Not selected for v1 |
| Godot | Strong game feel and scene tooling | Higher implementation overhead for local file workflows and web-like UI composition | Not selected for v1 |

### 5.2 Technology currency and breaking-change notes
- React: avoid deprecated Create React App flows; use Vite-based setup.
- Vite: v8 baseline and Node compatibility expectations changed from older templates.
- TypeScript 6.0: defaults and deprecations changed (for example types defaults and module resolution updates), requiring explicit tsconfig choices.
- Tauri v2: requires Rust and OS-specific prerequisites; packaging differs by OS.

### 5.3 Design principles from research
- Local-first and human-readable files reduce lock-in and simplify backup/versioning.
- Deterministic offline scoring avoids network volatility and API costs.
- Progressive phased gameplay (create -> author -> review) supports memory reinforcement.

---

## 6. Concept

### 6.1 Core Loop / Workflow

1. User creates/selects a subject dungeon.
2. Creator phase starts in root room with a Guide NPC.
3. User names topic and connected topics; app creates connected rooms and graph edges.
4. User traverses and repeats until map completeness target is met.
5. Scribe phase spawns room encounter per topic.
6. User submits room notes; if note-quality gate passes, encounter is defeated and artifact drops.
7. User accumulates XP and phase badges.
8. Archaeologist phase unlocks; user revisits rooms, reads/collects artifacts, and performs lightweight self-check prompts.

Text flow:

Creator -> graph built -> Scribe -> artifacts created -> Archaeologist -> exam review

### 6.2 Success / Completion Criteria
- A learner can create a subject dungeon with at least one root and multiple connected topic rooms.
- Every room can be completed in Scribe by passing the configured note gate (minimum 120 words, required sections, manual confirm).
- Archaeologist can access artifacts from all completed rooms.
- XP and badge progression reflects completion by room and phase using deterministic thresholds.

---

## 7. Technical Architecture

### 7.1 Technology Stack

| Layer | Technology | Version / Notes |
|------|------------|-----------------|
| Desktop shell | Tauri | v2.x line (observed latest 2.11.x) |
| Frontend UI | React | 19.2 major/minor line |
| Build tool | Vite | 8.0.x line |
| Language | TypeScript | 6.0 baseline |
| Runtime | Node.js | Must satisfy Vite requirements (20.19+ or 22.12+) |
| Storage | Local filesystem | Folder-per-room + JSON graph metadata |
| Testing | Vitest + Playwright + unit/integration harness | High-depth strategy for v1 |

### 7.2 Project Structure

```text
mindmap-dungeon/
  app/
    src/
      core/
        graph/
        progression/
        validation/
      features/
        creator/
        scribe/
        archaeologist/
      ui/
        screens/
        components/
      services/
        fileStore/
        importExport/
    tests/
      unit/
      integration/
      e2e/
  dungeon-data/
    <subject-id>/
      dungeon.json
      rooms/
        <room-id>/
          room.json
          notes.txt
          artifact.md
          attachments/
```

Dungeon metadata file (dungeon.json) v1 schema:

```json
{
  "schemaVersion": "1.0.0",
  "dungeonId": "01JZ...ULID",
  "subjectName": "Biology 101",
  "createdAt": "2026-05-21T00:00:00Z",
  "updatedAt": "2026-05-21T00:00:00Z",
  "phaseState": "CreatorActive",
  "rootRoomId": "01JZ...ULID",
  "rooms": [
    {
      "roomId": "01JZ...ULID",
      "topic": "Cell Structure",
      "status": "Created"
    }
  ],
  "edges": [
    {
      "fromRoomId": "01JZ...ULID",
      "toRoomId": "01JZ...ULID",
      "relationType": "prerequisite",
      "createdAt": "2026-05-21T00:00:00Z",
      "createdByPhase": "Creator"
    }
  ],
  "progression": {
    "xpTotal": 0,
    "rank": "Novice",
    "badges": []
  }
}
```

Dungeon integrity constraints (v1):
- roomId values must be unique and use ULID format.
- edges must reference existing rooms (no orphan edges).
- self-loop edges are disallowed by default.
- schemaVersion is required and must be semver-formatted.
- rootRoomId must reference an existing room.

Phase and room state enums (strict, v1):
- phaseState allowed values: SubjectCreated, CreatorActive, CreatorComplete, ScribeActive, ScribePartial, ScribeComplete, ArchaeologistUnlocked, ArchaeologistActive, SubjectMastered.
- room.state allowed values: Uncreated, Created, Visited, NotesDrafted, EncounterDefeated, ArtifactCollected, NeedsRevalidation.
- Unknown enum values are rejected at load/save and surfaced as validation errors.

Edge relationType enum (strict, v1):
- prerequisite
- subtopic
- analogy
- depends_on
- related

Room metadata file (rooms/<room-id>/room.json) v1 schema:

```json
{
  "roomId": "01JZ...ULID",
  "topic": "Cell Structure",
  "createdAt": "2026-05-21T00:00:00Z",
  "updatedAt": "2026-05-21T00:00:00Z",
  "state": "EncounterDefeated",
  "notePath": "notes.txt",
  "artifactPath": "artifact.md",
  "validationState": {
    "wordCount": 142,
    "requiredSectionsPresent": true,
    "manualConfirmed": true,
    "criterionScores": {
      "sectionCompleteness": 2,
      "conceptTermCoverage": 2,
      "linkReferences": 1,
      "recallQuestionQuality": 2,
      "clarityReadability": 1
    },
    "failedChecks": [],
    "qualityBonus": 8,
    "finalPass": true
  },
  "reviewPassCount": 1,
  "attachments": [
    {
      "attachmentId": "01JZ...ULID",
      "fileName": "diagram.png",
      "mimeType": "image/png",
      "relativePath": "attachments/diagram.png",
      "addedAt": "2026-05-21T00:00:00Z"
    }
  ]
}
```

Backup and retention policy (v1):
- Create a timestamped backup before schema migration and before critical write batches.
- Backup location: `<subject-id>/.backups/`.
- Retain last 5 backups per subject and prune older snapshots automatically.

Schema semver and migration policy (v1):
- PATCH (`x.y.Z`): Non-structural metadata or documentation-level defaults; no migration step required.
- MINOR (`x.Y.z`): Backward-compatible additive fields; migration optional and auto-fill defaults allowed.
- MAJOR (`X.y.z`): Breaking structural changes; migration step required with backup + rollback path.

### 7.3 Key APIs / Interfaces

| Interface | Direction | Purpose |
|-----------|-----------|---------|
| FileStore.loadDungeon(subjectId) | App -> FS | Load graph, room metadata, completion states |
| FileStore.migrateSchema(subjectId, fromVersion, toVersion) | App -> FS | Apply forward-only schema migration with pre-migration backup |
| FileStore.saveRoomNote(subjectId, roomId, noteText) | App -> FS | Persist notes and trigger validation |
| Progression.awardXp(event) | Core | Apply XP and badge rules deterministically |
| Validation.evaluateNote(roomContext, noteText) | Core | Return pass/fail and unmet criteria |
| ErrorCatalog.resolve(code) | Core | Map stable error code to user-facing remediation text |
| Archaeologist.getRoomArtifacts(subjectId) | Core -> UI | Serve artifact list and preview content |

ValidationState constraints (v1):
- `wordCount` must be integer >= 0.
- `requiredSectionsPresent` and `manualConfirmed` must be booleans.
- `criterionScores` must include exactly 5 keys with integer values 0..2.
- `failedChecks` must be an array of stable check IDs (for example `min_word_count`, `missing_recall_question`).
- `qualityBonus` must equal sum of criterionScores and be capped at 0..10.
- `finalPass` must be true only if minimum word count, required sections, and manual confirmation all pass.

Error code catalog (v1, stable):
- `VAL_WORD_COUNT_TOO_LOW`: Note did not meet minimum 120-word requirement.
- `VAL_REQUIRED_SECTION_MISSING`: One or more required sections missing.
- `VAL_MANUAL_CONFIRM_REQUIRED`: Manual confirmation not completed.
- `VAL_ENUM_INVALID`: phaseState/room.state/relationType value not in allowed enum.
- `VAL_EDGE_ORPHAN`: Edge references non-existent room.
- `VAL_ROOT_ROOM_INVALID`: rootRoomId missing or invalid.
- `SCHEMA_VERSION_MISSING`: schemaVersion absent or malformed.
- `SCHEMA_FIELD_INVALID`: Field present but fails type/constraint checks.
- `IO_READ_FAILED`: File read failure.
- `IO_WRITE_FAILED`: File write failure.
- `MIGRATION_REQUIRED`: Major schema mismatch requires migration.
- `MIGRATION_FAILED`: Migration attempt failed; rollback needed.
- `BACKUP_CREATE_FAILED`: Backup snapshot creation failed.
- `BACKUP_RESTORE_FAILED`: Backup restore operation failed.

---

## 8. Functional Requirements

### 8.1 Creator Phase Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CR-01 | System shall create a new subject dungeon with a root room initialized from user input. | Must |
| CR-08 | System shall allow users to open/select an existing subject dungeon and resume exploration and updates. | Must |
| CR-02 | System shall prompt for connected topics and create linked rooms from confirmed entries. | Must |
| CR-03 | System shall support cross-links between existing rooms (graph edges beyond parent-child). | Must |
| CR-04 | System shall prevent duplicate room IDs and preserve unique topic identity. | Must |
| CR-05 | System shall display unresolved/unvisited rooms to guide creation progress. | Should |
| CR-06 | System should provide optional topic suggestions without auto-committing them. | Should |
| CR-07 | If graph edits occur after Scribe starts, system shall mark impacted rooms as NeedsRevalidation and revoke cleared status until revalidated. | Must |

### 8.2 Scribe Phase Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| SC-01 | System shall spawn one encounter per room requiring note submission to clear. | Must |
| SC-02 | System shall validate notes using rule-based checks: minimum 120 words, required sections (Summary, Key Points, Recall Question), and manual confirm. | Must |
| SC-03 | On pass, system shall mark room defeated and generate artifact output. | Must |
| SC-04 | On fail, system shall show unmet criteria and allow retry without data loss. | Must |
| SC-05 | System shall update XP and badge state immediately after successful room completion. | Must |
| SC-06 | System should support note revision and re-save after room completion. | Should |
| SC-07 | System shall score quality bonus from local rule checks (for example section completeness and keyword/tag coverage) with a bounded range of 0-10 XP. | Must |
| SC-08 | System shall compute quality bonus using deterministic rubric: 5 criteria scored 0-2 each (section completeness, concept term coverage, link references, recall-question quality, clarity/readability), summed to 0-10. | Must |

### 8.3 Archaeologist Phase Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| AR-01 | System shall unlock Archaeologist when Scribe completion threshold is met. | Must |
| AR-02 | System shall let user traverse dungeon and open room artifacts. | Must |
| AR-03 | System shall provide lightweight self-check prompts per room using offline templates derived from room metadata and note headings. | Should |
| AR-04 | System should track reviewed-room streaks or counts for revision analytics. | Could |
| AR-05 | System should render markdown artifacts with linked local attachments (for example images or PDFs) in review mode. | Should |

### 8.4 Progression and Rewards Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| PR-01 | System shall award per-room XP using formula: 20 base XP + quality bonus (0-10) + streak bonus (0-5). | Must |
| PR-02 | System shall issue phase completion badges per subject at thresholds: Creator badge at >= 90% mapped rooms, Scribe badge at 100% room clears, Archaeologist badge after 2 full review passes. | Must |
| PR-03 | System shall maintain subject rank tiers based on cumulative XP: Novice (0-299), Scholar (300-799), Master (800+). | Should |
| PR-04 | System should display reward history timeline in subject dashboard. | Could |
| PR-05 | System shall display an XP breakdown after each room clear (base, quality, streak, total delta). | Should |

### 8.5 Data Management Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| DM-01 | System shall persist all dungeon content in local filesystem folders and JSON/text files. | Must |
| DM-02 | System shall maintain graph integrity between dungeon.json edges and room metadata. | Must |
| DM-03 | System shall support import/export of a subject dungeon directory. | Should |
| DM-04 | System should provide integrity check and recovery guidance for corrupted files. | Should |
| DM-05 | System shall persist per-room artifact attachments in a room-scoped attachments directory and preserve links on export/import. | Should |
| DM-06 | System shall include schemaVersion in dungeon metadata and run forward migration automatically on load after creating a backup snapshot. | Must |
| DM-07 | System shall enforce dungeon-level integrity constraints at load and save time (unique room IDs, valid edge references, root room validity, and self-loop policy). | Must |
| DM-08 | System shall enforce room-level schema validation for required fields (state, note/artifact paths, validationState, reviewPassCount, attachments metadata). | Must |
| DM-09 | System shall maintain timestamped backups in subject-scoped `.backups/` and retain the most recent 5 snapshots. | Should |
| DM-10 | System shall validate strict enum membership for phaseState, room.state, and edges.relationType on every load/save operation. | Must |
| DM-11 | System shall enforce validationState constraints and deterministic qualityBonus derivation from criterionScores. | Must |
| DM-12 | System shall emit stable error codes for validation, schema, IO, backup, and migration failures. | Must |
| DM-13 | System shall apply semver migration policy (patch/minor/major) and require backup+rollback handling for major migrations. | Must |

---

## 9. Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-01 | App shall run fully offline after installation. | Must |
| NF-02 | App shall open an existing dungeon project in <= 2 seconds for maps up to 500 rooms on recommended hardware. | Should |
| NF-03 | Core save operations (note save, room state update) shall complete in <= 200 ms p95 for local SSD environments. | Should |
| NF-04 | Architecture shall separate core logic from UI to maximize testability. | Must |
| NF-05 | Data format shall remain human-readable and Git-friendly. | Must |
| NF-06 | Crash or forced-close shall not corrupt previously committed room data (atomic write strategy). | Must |

---

## 10. Security and Privacy

| ID | Requirement | Priority |
|----|-------------|----------|
| SP-01 | v1 shall not transmit user dungeon or note data to external services by default. | Must |
| SP-02 | v1 shall not require cloud account authentication. | Must |
| SP-03 | App shall scope filesystem access to explicit user-selected project folders. | Must |
| SP-04 | App shall sanitize user-provided topic names for safe path/file handling. | Must |
| SP-05 | App should provide optional local backup/export reminders. | Should |

Data handling statement:
- Collected: user-entered topic names, graph links, notes, progression metadata.
- Stored: local filesystem only.
- Transmitted: none by default in v1.
- Sensitive data expectation: educational notes may include personal study content; treat as private local data.
- Compliance posture: no explicit regulated-data workflows in v1; if institutional use emerges, evaluate FERPA/GDPR implications in future phases.

---

## 11. Accessibility

| ID | Requirement | Priority |
|----|-------------|----------|
| ACC-01 | v1 shall provide basic keyboard navigation across primary flows. | Must |
| ACC-02 | v1 shall include visible focus states and minimum readable contrast in core UI. | Must |
| ACC-03 | v1 should include reduced-motion toggle for major transitions. | Should |
| ACC-04 | v1 should label interactive controls for screen-reader compatibility in primary screens. | Should |
| ACC-05 | Full WCAG 2.1 AA audit is targeted for post-v1 hardening. | Could |

---

## 12. User Interface / Interaction Design

- Experience framing:
  - Creator: exploration + world-building prompts from Guide NPC.
  - Scribe: combat metaphor tied to note completion.
  - Archaeologist: calm retrieval/review mode.
- Core screens:
  - Subject dashboard (progress, badges, phase state).
  - Dungeon map view (node graph and traversal controls).
  - Room interaction panel (NPC prompt, note editor, validation feedback).
  - Artifact viewer (markdown-style reading panel).
- Interaction patterns:
  - Enter room -> dialog prompt -> action panel.
  - Submit note -> validation result -> reward animation/event log.
  - Review mode -> artifact browse + self-check card.
- Visual defaults (assumption): stylized dungeon theme with readable educational UI overlays.

---

## 13. System States / Lifecycle

Primary state machine:

1. SubjectCreated
2. CreatorActive
3. CreatorComplete
4. ScribeActive
5. ScribePartial
6. ScribeComplete
7. ArchaeologistUnlocked
8. ArchaeologistActive
9. SubjectMastered (optional threshold)

Room-level states:
- Uncreated -> Created -> Visited -> NotesDrafted -> EncounterDefeated -> ArtifactCollected

Error/recovery states:
- ValidationFailed
- DataIntegrityWarning
- SaveConflictDetected

---

## 14. Implementation Phases

### Phase 1: Creator Foundation
- [ ] Initialize Tauri + React + Vite + TypeScript project skeleton.
- [ ] Implement local subject/dungeon creation, selection, and root room flow.
- [ ] Implement room linking and cross-link graph editing.
- [ ] Build map traversal UI and creation progress indicators.
- [ ] Add persistence for dungeon.json + room.json.
- [ ] Implement schema validation and ULID generation for dungeon/room entities.
- [ ] Add high-priority unit/integration tests for graph creation/integrity.

### Phase 2: Scribe Combat-Notes Loop
- [ ] Implement encounter state per room.
- [ ] Build note editor and rule-based validation engine.
- [ ] Generate artifact files on successful completion.
- [ ] Implement attachment metadata indexing in room.json.
- [ ] Implement XP awarding and Creator/Scribe badge logic.
- [ ] Add failure feedback and retry flows.
- [ ] Add integration and end-to-end tests for room completion loop.

### Phase 3: Archaeologist Review Experience
- [ ] Unlock and implement Archaeologist traversal mode.
- [ ] Build artifact browsing and reading experience.
- [ ] Add lightweight self-check prompt mechanics.
- [ ] Implement subject rank tiers and full reward summary view.
- [ ] Add import/export and basic integrity diagnostics.
- [ ] Implement backup snapshot retention (last 5) and migration rollback recovery path.
- [ ] Execute cross-platform QA hardening (Linux/macOS/Windows).

---

## 15. Testing Strategy

| Level | Scope | Tools / Approach |
|-------|-------|------------------|
| Unit Tests | Graph operations, validation rules, XP calculations | Vitest with deterministic fixtures |
| Integration Tests | Phase transitions, save/load pipelines, artifact generation | Vitest + file-system mocks/temp dirs |
| Manual / Exploratory | UX feel, NPC flow clarity, review usability | Structured playtest scripts and issue logs |
| Performance | Large-map load/save and traversal responsiveness | Benchmark harness with generated 100/250/500-room datasets |
| Cross-Platform | Linux/macOS/Windows parity | CI matrix + manual smoke verification |
| End-to-End | Core journeys across all three phases | Playwright-driven desktop/webview interaction tests |

Key test scenarios checklist:
1. Create root room and at least 10 connected rooms with cross-links.
2. Save, close app, reopen, and verify graph integrity.
3. Fail Scribe validation for <120 words, then pass after correction.
4. Generate artifact and verify filesystem output contents.
5. Unlock Archaeologist and review all cleared rooms.
6. Confirm XP totals using formula 20 + quality + streak and verify bonus bounds.
7. Import/export roundtrip without ID collisions.
8. Recover gracefully from malformed room.json.
9. Validate keyboard-only operation for primary task flow.
10. Verify no network calls occur in local-only mode.
11. Verify Creator badge unlocks at >=90% mapped rooms.
12. Verify Scribe badge unlocks only at 100% room clears.
13. Verify Archaeologist badge unlocks only after 2 complete review passes.
14. Verify unknown phaseState or room.state values fail validation with recoverable error messaging.
15. Verify unknown relationType values fail validation and do not persist.
16. Verify quality bonus rubric scoring is deterministic and capped to 0-10.
17. Verify `qualityBonus` equals sum of criterionScores and rejects mismatch.
18. Verify every failure path maps to a stable error code from catalog.
19. Verify major version mismatch triggers migration flow with pre-migration backup.
20. Verify failed migration restores previous snapshot and emits rollback error codes.

---

## 16. Analytics / Success Metrics

No external telemetry is planned in v1. Success will be measured through local session summaries and user-reported outcomes.

v1 analytics export:
- App shall provide local CSV export of per-subject progress metrics, badge unlock timestamps, and review session counts.

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| Creator completion rate | >= 80% of started subjects reach CreatorComplete | Local per-subject progress state |
| Scribe completion rate | >= 60% of CreatorComplete subjects | Room defeat counts and phase completion |
| Archaeologist engagement | >= 3 review sessions per completed subject | Local session/event logs |
| Note coverage | >= 90% of rooms have non-empty notes by ScribeComplete | File/content validation scan |
| Perceived recall improvement | Positive self-rating from user post-review | In-app optional self-report prompt |

---

## 17. Acceptance Criteria

### 17.1 Component Coverage

| Major Component | Acceptance Criteria Summary |
|-----------------|-----------------------------|
| Creator | User can create a dungeon, add linked rooms, add cross-links, reopen an existing subject, and persist graph state locally. |
| Scribe | Every room requires a passing note gate, generates an artifact on success, awards deterministic XP, and supports retries on failure. |
| Archaeologist | User can unlock review mode, traverse cleared rooms, read artifacts, render attachments, and use template-generated self-check prompts. |
| Data / Migration | Schema validation, ULID generation, backups, error codes, enum enforcement, and forward-only migrations work without corrupting data. |
| Cross-cutting | App runs offline, preserves privacy, maintains atomic writes, and supports the stated cross-platform targets. |

1. User can create and persist a subject dungeon locally with graph links and cross-links.
2. Creator phase supports iterative room-topic expansion from NPC-guided prompts.
3. Scribe phase blocks room completion until note gate is satisfied: >=120 words, sections Summary + Key Points + Recall Question, and manual confirm.
4. Successful Scribe completion creates per-room artifact files.
5. Archaeologist mode allows traversal and artifact review without editing requirements.
6. XP is awarded per cleared room as base 20 + quality bonus (0-10) + streak bonus (0-5), with correct total and breakdown.
7. Phase badges unlock exactly at configured thresholds: Creator >=90% map completion, Scribe 100% room clears, Archaeologist after 2 full review passes.
8. App works offline with no required network or account dependency.
9. Data survives restart and loads without losing room/progression state.
10. High-priority automated tests pass for graph, validation, persistence, and progression flows.
11. Cross-platform smoke testing is successful on Linux, macOS, and Windows.

---

## 18. Dependencies and Risks

### 18.1 Dependencies

| Dependency | Type | Risk if Unavailable | Mitigation |
|------------|------|---------------------|------------|
| Tauri runtime and toolchain | framework/tooling | Desktop packaging and shell unavailable | Maintain Electron fallback spike branch |
| Rust toolchain | build dependency | Native build blocked | CI preflight checks and setup docs |
| Node.js (20.19+ or 22.12+) | runtime/tooling | Vite build/dev fails | Version manager config and engine checks |
| OS webview dependencies | system dependency | App launch/build failure on some platforms | Prerequisite validation and installer guidance |
| Local filesystem permissions | platform/environment | Cannot read/write dungeon data | First-run permission checks and clear error UX |

### 18.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope expansion due to game mechanics | Medium | High | Enforce v1 non-goals and milestone gates |
| File-format drift causing load failures | Medium | High | Schema versioning + migration layer |
| Accessibility debt from theme-heavy UI | Medium | Medium | Accessibility checklist in definition of done |
| Cross-platform packaging friction | Medium | Medium | Early CI matrix and platform-specific test passes |
| Note validation too strict or too weak | Medium | Medium | Configurable thresholds + playtest tuning |

---

## 19. Future Considerations

| Item | Description | Potential Version |
|------|-------------|-------------------|
| Cloud sync | Optional encrypted sync across devices | v2 |
| Teacher workflows | Assignment templates, class monitoring | v2/v3 |
| AI-assisted feedback | Optional semantic note feedback and hinting | v2 |
| Full quiz engine | Spaced repetition, adaptive questioning | v2 |
| WCAG 2.1 AA full compliance pass | Expanded accessibility conformance and audit | v2 |
| Mobile companion | Read-only artifact review on mobile | v3 |

---

## 20. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Preferred final visual style (retro/cozy/minimal hybrid)? | Dungeon-inspired UI with readable modern overlays |
| 2 | Should revalidation after graph edits preserve prior note content snapshots for comparison? | Preserve note content and append revalidation metadata in v1 |
| 3 | Should relationType become user-extendable after v1 with migration-safe custom namespaces? | Keep strict built-in enum in v1; evaluate extension model in v2 |
| 4 | Should artifact attachment previews be fully in-app for all file types or partly OS-open fallback? | In-app preview for common types; OS fallback for unsupported types |
| 5 | Should generated self-check prompts be editable by the user in v1? | Generated prompts are editable and saved with room artifact metadata |
| 6 | Should CSV analytics exports support date-range filtering in v1? | Full-history export in v1; date-range filtering deferred |

---

## 21. Glossary

| Term | Definition |
|------|------------|
| Subject Dungeon | A complete mindmap project for one subject/topic area |
| Room | A node/topic in the subject graph |
| Edge | A connection between rooms/topics |
| Creator | Phase where user builds topic graph |
| Scribe | Phase where user writes notes to clear encounters |
| Archaeologist | Phase where user reviews collected artifacts |
| Artifact | File generated from a cleared room's notes for later study |
| XP | Experience points awarded for progress events |
| Badge | Milestone reward tied to phase completion |
| Cross-Link | Non-hierarchical connection between two existing rooms |
