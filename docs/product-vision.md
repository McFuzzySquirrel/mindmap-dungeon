# Product Vision: Mindmap Dungeon

## 1. Overview

**Product Name:** Mindmap Dungeon  
**Summary:** A local-first desktop learning game that transforms studying into a three-phase dungeon loop: create topic rooms, defeat note-based encounters, and revisit the cleared dungeon for exam preparation.  
**Target Platform:** Desktop application for Linux, macOS, and Windows.  
**Key Constraints:** Offline-first, filesystem-backed, deterministic progression, no cloud AI dependency, and strict local data ownership.  
**Original PRD:** [PRD.md](../PRD.md)

---

## 2. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-22 | GitHub Copilot | Initial product vision decomposed from PRD |

---

## 3. Goals and Non-Goals

### 3.1 Goals
- Improve recall before exams through spatial/topic traversal.
- Convert mindmap creation into a room-based progression loop.
- Reinforce comprehension through structured note writing.
- Enable review mode that reuses collected artifacts for rapid revision.
- Reward completion with XP, badges, and subject-level progression.

### 3.2 Non-Goals
- Multiplayer, co-op, or shared dungeon experiences in v1.
- Cloud sync, remote accounts, and server-side storage in v1.
- AI-generated note content or AI-based grading in v1.
- Teacher assignment and classroom orchestration workflows in v1.
- Mobile-first release in v1.

---

## 4. Personas

| Persona | Description | Key Needs |
|---------|-------------|-----------|
| Solo Student (Primary) | Independent learner preparing for exams in one or more subjects | Build clear topic structure, write effective notes, review quickly before tests |
| Structured Note-Taker | Learner who values organized notes and progress tracking | Standardized note format, visible completion state, easy revisit of prior work |
| Last-Minute Reviewer | Learner doing high-intensity revision close to exam date | Fast navigation, artifact collection/readback, lightweight recall prompts |

---

## 5. Research Findings

Technology and ecosystem checks were performed on 2026-05-21.

- Tauri v2 is current; latest observed release line includes 2.11.x.
- React docs indicate latest major/minor stream is 19.2, with 19.2.x patches.
- Vite latest stable observed is 8.0.x; docs include migration guidance from v7.
- TypeScript 6.0 is documented as a transition release with important deprecations.

### Technology choice rationale

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Tauri + React + Vite + TypeScript | Lightweight desktop binary, strong local FS integration, modern frontend tooling | Requires Rust toolchain and OS-specific setup | Selected |
| Electron + React | Mature ecosystem, easier JS-only onboarding | Higher memory footprint and larger binaries | Not selected for v1 |
| Godot | Strong game feel and scene tooling | Higher implementation overhead for local file workflows and web-like UI composition | Not selected for v1 |

### Design principles
- Local-first and human-readable files reduce lock-in and simplify backup/versioning.
- Deterministic offline scoring avoids network volatility and API costs.
- Progressive phased gameplay supports memory reinforcement.

---

## 6. Technical Architecture

### 6.1 Technology Stack

| Layer | Technology | Version / Notes |
|------|------------|-----------------|
| Desktop shell | Tauri | v2.x line (observed latest 2.11.x) |
| Frontend UI | React | 19.2 major/minor line |
| Build tool | Vite | 8.0.x line |
| Language | TypeScript | 6.0 baseline |
| Runtime | Node.js | Must satisfy Vite requirements (20.19+ or 22.12+) |
| Storage | Local filesystem | Folder-per-room + JSON graph metadata |
| Testing | Vitest + Playwright + unit/integration harness | High-depth strategy for v1 |

### 6.2 Project Structure

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
      .backups/
```

### 6.3 Key APIs / Interfaces

| Interface | Direction | Purpose |
|-----------|-----------|---------|
| FileStore.loadDungeon(subjectId) | App -> FS | Load graph, room metadata, completion states |
| FileStore.migrateSchema(subjectId, fromVersion, toVersion) | App -> FS | Apply forward-only schema migration with pre-migration backup |
| FileStore.saveRoomNote(subjectId, roomId, noteText) | App -> FS | Persist notes and trigger validation |
| Progression.awardXp(event) | Core | Apply XP and badge rules deterministically |
| Validation.evaluateNote(roomContext, noteText) | Core | Return pass/fail and unmet criteria |
| ErrorCatalog.resolve(code) | Core | Map stable error code to user-facing remediation text |
| Archaeologist.getRoomArtifacts(subjectId) | Core -> UI | Serve artifact list and preview content |

---

## 7. Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NF-01 | App shall run fully offline after installation. | Must |
| NF-02 | App shall open an existing dungeon project in <= 2 seconds for maps up to 500 rooms on recommended hardware. | Should |
| NF-03 | Core save operations shall complete in <= 200 ms p95 for local SSD environments. | Should |
| NF-04 | Architecture shall separate core logic from UI to maximize testability. | Must |
| NF-05 | Data format shall remain human-readable and Git-friendly. | Must |
| NF-06 | Crash or forced-close shall not corrupt previously committed room data (atomic write strategy). | Must |

---

## 8. Security and Privacy

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

## 9. Accessibility

| ID | Requirement | Priority |
|----|-------------|----------|
| ACC-01 | v1 shall provide basic keyboard navigation across primary flows. | Must |
| ACC-02 | v1 shall include visible focus states and minimum readable contrast in core UI. | Must |
| ACC-03 | v1 should include reduced-motion toggle for major transitions. | Should |
| ACC-04 | v1 should label interactive controls for screen-reader compatibility in primary screens. | Should |
| ACC-05 | Full WCAG 2.1 AA audit is targeted for post-v1 hardening. | Could |

---

## 10. System States / Lifecycle

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

## 11. Analytics / Success Metrics

No external telemetry is planned in v1. Success will be measured through local session summaries and user-reported outcomes.

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| Creator completion rate | >= 80% of started subjects reach CreatorComplete | Local per-subject progress state |
| Scribe completion rate | >= 60% of CreatorComplete subjects | Room defeat counts and phase completion |
| Archaeologist engagement | >= 3 review sessions per completed subject | Local session/event logs |
| Note coverage | >= 90% of rooms have non-empty notes by ScribeComplete | File/content validation scan |
| Perceived recall improvement | Positive self-rating from user post-review | In-app optional self-report prompt |

---

## 12. Dependencies and Risks

### 12.1 Dependencies

| Dependency | Type | Risk if Unavailable | Mitigation |
|------------|------|---------------------|------------|
| Tauri runtime and toolchain | framework/tooling | Desktop packaging and shell unavailable | Maintain Electron fallback spike branch |
| Rust toolchain | build dependency | Native build blocked | CI preflight checks and setup docs |
| Node.js (20.19+ or 22.12+) | runtime/tooling | Vite build/dev fails | Version manager config and engine checks |
| OS webview dependencies | system dependency | App launch/build failure on some platforms | Prerequisite validation and installer guidance |
| Local filesystem permissions | platform/environment | Cannot read/write dungeon data | First-run permission checks and clear error UX |

### 12.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope expansion due to game mechanics | Medium | High | Enforce v1 non-goals and milestone gates |
| File-format drift causing load failures | Medium | High | Schema versioning + migration layer |
| Accessibility debt from theme-heavy UI | Medium | Medium | Accessibility checklist in definition of done |
| Cross-platform packaging friction | Medium | Medium | Early CI matrix and platform-specific test passes |
| Note validation too strict or too weak | Medium | Medium | Configurable thresholds + playtest tuning |

---

## 13. Future Considerations

| Item | Description | Potential Version |
|------|-------------|-------------------|
| Cloud sync | Optional encrypted sync across devices | v2 |
| Teacher workflows | Assignment templates, class monitoring | v2/v3 |
| AI-assisted feedback | Optional semantic note feedback and hinting | v2 |
| Full quiz engine | Spaced repetition, adaptive questioning | v2 |
| WCAG 2.1 AA full compliance pass | Expanded accessibility conformance and audit | v2 |
| Mobile companion | Read-only artifact review on mobile | v3 |

---

## 14. Features

| # | Feature | File | Dependencies | Priority |
|---|---------|------|-------------|----------|
| 1 | Foundation | [docs/features/foundation.md](features/foundation.md) | None | Must |
| 2 | Creator Dungeon | [docs/features/creator-dungeon.md](features/creator-dungeon.md) | Foundation | Must |
| 3 | Scribe Encounters | [docs/features/scribe-encounters.md](features/scribe-encounters.md) | Foundation, Creator Dungeon | Must |
| 4 | Progression | [docs/features/progression.md](features/progression.md) | Foundation, Scribe Encounters | Should |
| 5 | Archaeologist Review | [docs/features/archaeologist-review.md](features/archaeologist-review.md) | Foundation, Creator Dungeon, Scribe Encounters, Progression | Should |

### Feature Dependency Graph

```text
Foundation
├── Creator Dungeon
│   └── Scribe Encounters
├── Progression
│   └── Scribe Encounters
└── Archaeologist Review
    ├── Creator Dungeon
    ├── Scribe Encounters
    └── Progression
```

---

## 15. Glossary

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

---

## 16. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Preferred final visual style (retro/cozy/minimal hybrid)? | Dungeon-inspired UI with readable modern overlays |
| 2 | Should revalidation after graph edits preserve prior note content snapshots for comparison? | Preserve note content and append revalidation metadata in v1 |
| 3 | Should relationType become user-extendable after v1 with migration-safe custom namespaces? | Keep strict built-in enum in v1; evaluate extension model in v2 |
| 4 | Should artifact attachment previews be fully in-app for all file types or partly OS-open fallback? | In-app preview for common types; OS fallback for unsupported types |
| 5 | Should generated self-check prompts be editable by the user in v1? | Generated prompts are editable and saved with room artifact metadata |
| 6 | Should CSV analytics exports support date-range filtering in v1? | Full-history export in v1; date-range filtering deferred |
