# Feature: Scribe Encounters

## Traceability

| Feature ID | Original PRD ID | Description |
|-----------|----------------|-------------|
| SCR-US-01 | US-03 | Defeat room encounters by submitting notes that pass rules |
| SCR-FR-01 | SC-01 | Spawn one encounter per room requiring note submission to clear |
| SCR-FR-02 | SC-02 | Validate notes using minimum word count, required sections, and manual confirm |
| SCR-FR-03 | SC-03, SC-04 | Mark rooms defeated on pass and allow safe retries on fail |
| SCR-FR-04 | SC-06 | Support note revision and resave after room completion |
| SCR-FR-05 | SC-07, SC-08 | Score quality bonus using a deterministic rubric |

**Product Vision:** [docs/product-vision.md](../product-vision.md)  
**Original PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Scribe Encounters  
**ID Prefix:** SCR  
**Summary:** Turn each room into an encounter that is defeated by writing and validating notes, then generate a collectible artifact.  
**Dependencies:** Foundation, Creator Dungeon  
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| SCR-US-01 | structured note-taker | defeat room encounters by submitting notes that pass rules | I am pushed to produce useful revision notes | Must |

---

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| SCR-FR-01 | System shall spawn one encounter per room requiring note submission to clear. | Must |
| SCR-FR-02 | System shall validate notes using a deterministic gate: minimum 120 words, required sections, and manual confirmation. | Must |
| SCR-FR-03 | On pass, system shall mark room defeated and generate artifact output. | Must |
| SCR-FR-04 | On fail, system shall show unmet criteria and allow retry without data loss. | Must |
| SCR-FR-05 | System shall support note revision and re-save after room completion. | Should |
| SCR-FR-06 | System shall compute the quality bonus from the 5-criterion rubric and expose the result for progression tracking. | Must |
| SCR-FR-07 | System shall ensure room completion is idempotent and does not duplicate artifact generation. | Must |

---

## 4. UI / Interaction Design

- Encounter panel with the room topic, current note requirements, and pass/fail feedback.
- Note editor with the required sections visible as guidance.
- Retry flow that preserves draft notes and highlights unmet criteria.
- Artifact generation confirmation when the room is cleared.

---

## 5. Implementation Tasks

### Phase 1: Encounter Lifecycle
- [ ] Spawn one encounter per room.
- [ ] Build the note editor and validation feedback panel.
- [ ] Wire manual confirmation into completion flow.
- [ ] Persist note drafts and completion state.

### Phase 2: Completion and Retry
- [ ] Implement artifact generation on pass.
- [ ] Add retry handling and idempotent completion checks.
- [ ] Expose validation breakdown for progression hooks.
- [ ] Support post-completion note revision and resave.

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit Tests | Word count, section checks, quality rubric, completion idempotency | Deterministic note fixtures |
| Integration Tests | Encounter clear/fail/retry flow and artifact generation | Temp room fixtures |

Key test scenarios:
1. Fail validation when the note is below the word count threshold.
2. Fail validation when a required section is missing.
3. Pass validation after correcting the note and confirming manually.
4. Confirm artifact generation happens only once per cleared room.

---

## 7. Acceptance Criteria

1. Each room spawns an encounter that requires note submission.
2. Notes must satisfy the configured gate before the room is cleared.
3. Passing a room generates a collectible artifact.
4. Failing validation preserves the draft and shows specific unmet criteria.
5. Completion is idempotent and does not duplicate rewards or artifacts.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Should the note editor support markdown shortcuts in v1? | Yes, basic markdown shortcuts only |
| 2 | Should required sections be user-configurable later? | Keep them fixed in v1 |
