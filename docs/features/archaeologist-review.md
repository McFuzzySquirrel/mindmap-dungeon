# Feature: Archaeologist Review

## Traceability

| Feature ID | Original PRD ID | Description |
|-----------|----------------|-------------|
| ARC-US-01 | US-04 | Revisit the completed dungeon and read collected artifacts |
| ARC-US-02 | US-07 | Use short self-check prompts in review mode |
| ARC-FR-01 | AR-01 | Unlock Archaeologist when Scribe completion threshold is met |
| ARC-FR-02 | AR-02 | Traverse the dungeon and open room artifacts |
| ARC-FR-03 | AR-03 | Provide lightweight self-check prompts using room metadata and note headings |
| ARC-FR-04 | AR-04 | Track reviewed-room streaks or counts for revision analytics |
| ARC-FR-05 | AR-05 | Render markdown artifacts with linked local attachments |

**Product Vision:** [docs/product-vision.md](../product-vision.md)  
**Original PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Archaeologist Review  
**ID Prefix:** ARC  
**Summary:** Let the learner revisit a completed dungeon, inspect artifacts, and use lightweight recall prompts to prepare for exams.  
**Dependencies:** Foundation, Creator Dungeon, Scribe Encounters, Progression  
**Priority:** Should

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| ARC-US-01 | last-minute reviewer | revisit the completed dungeon and read collected artifacts | I can rapidly review before an exam | Must |
| ARC-US-02 | last-minute reviewer | use short self-check prompts in review mode | I can test recall without full quiz overhead | Should |

---

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| ARC-FR-01 | System shall unlock Archaeologist when Scribe completion threshold is met. | Must |
| ARC-FR-02 | System shall let the user traverse completed rooms and open room artifacts. | Must |
| ARC-FR-03 | System shall provide lightweight self-check prompts per room using offline templates derived from room metadata and note headings. | Should |
| ARC-FR-04 | System should track reviewed-room streaks or counts for revision analytics. | Could |
| ARC-FR-05 | System should render markdown artifacts with linked local attachments in review mode. | Should |

---

## 4. UI / Interaction Design

- Review-mode map view that emphasizes cleared rooms and artifact status.
- Artifact reader for markdown notes and linked attachments.
- Self-check prompt panel with quick prompts and minimal interruption.
- Review-progress indicators for streaks and revisit counts.

---

## 5. Implementation Tasks

### Phase 1: Review Mode
- [ ] Unlock review mode when the Scribe completion threshold is reached.
- [ ] Build traversal for cleared rooms and artifact viewing.
- [ ] Render markdown artifacts and linked attachments.

### Phase 2: Recall Prompts
- [ ] Generate self-check prompts from room metadata and note headings.
- [ ] Track review counts or streaks.
- [ ] Wire review events into progression and analytics.

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit Tests | Unlock logic, prompt generation, attachment rendering rules | Deterministic review fixtures |
| Integration Tests | Review traversal, artifact readback, and prompt display | Completed dungeon fixtures |

Key test scenarios:
1. Unlock Archaeologist after the Scribe threshold is met.
2. Open a room artifact and verify markdown and attachments render correctly.
3. Generate a self-check prompt from room metadata.
4. Track review counts or streaks across repeated revisits.

---

## 7. Acceptance Criteria

1. Review mode unlocks only after Scribe completion requirements are met.
2. The user can traverse completed rooms and open artifacts.
3. Self-check prompts are generated from local room metadata and note headings.
4. Linked attachments can be viewed or opened from review mode.
5. Review counts or streaks are tracked for later progress reporting.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Should review prompts be skippable without affecting streaks? | Skippable, but skipped prompts do not count toward streaks |
| 2 | Should attachment viewing support zooming in v1? | Basic open/view only |
