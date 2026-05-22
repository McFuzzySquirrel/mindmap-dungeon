# Feature: Creator Dungeon

## Traceability

| Feature ID | Original PRD ID | Description |
|-----------|----------------|-------------|
| CRT-US-01 | US-01 | Create a root topic and linked subtopics by moving room-to-room |
| CRT-US-02 | US-02 | Add cross-links between existing topics |
| CRT-FR-01 | CR-01 | Create a new subject dungeon with a root room |
| CRT-FR-02 | CR-02 | Prompt for connected topics and create linked rooms from confirmed entries |
| CRT-FR-03 | CR-03 | Support cross-links between existing rooms |
| CRT-FR-04 | CR-04 | Prevent duplicate room IDs and preserve unique topic identity |
| CRT-FR-05 | CR-05 | Display unresolved/unvisited rooms to guide creation progress |
| CRT-FR-06 | CR-06 | Provide optional topic suggestions without auto-committing them |
| CRT-FR-07 | CR-07 | Revalidate impacted rooms after graph edits made post-Scribe |

**Product Vision:** [docs/product-vision.md](../product-vision.md)  
**Original PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Creator Dungeon  
**ID Prefix:** CRT  
**Summary:** Let the learner create and grow a dungeon graph by turning topic ideas into rooms, links, and cross-links.  
**Dependencies:** Foundation  
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| CRT-US-01 | solo student | create a root topic and linked subtopics by moving room-to-room | my subject structure becomes a playable map | Must |
| CRT-US-02 | solo student | add cross-links between existing topics | I can model non-tree relationships | Must |

---

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CRT-FR-01 | System shall create a new subject dungeon with a root room initialized from user input. | Must |
| CRT-FR-02 | System shall prompt for connected topics and create linked rooms from confirmed entries. | Must |
| CRT-FR-03 | System shall support cross-links between existing rooms and maintain graph integrity. | Must |
| CRT-FR-04 | System shall prevent duplicate room identity within a subject and preserve unique topic names. | Must |
| CRT-FR-05 | System shall display unresolved and unvisited rooms to guide creation progress. | Should |
| CRT-FR-06 | System should provide optional topic suggestions without auto-committing them. | Should |
| CRT-FR-07 | If graph edits occur after Scribe starts, system shall mark impacted rooms as NeedsRevalidation and revoke cleared status until revalidated. | Must |

---

## 4. UI / Interaction Design

- Root-room prompt screen for entering the subject topic.
- Room-to-room traversal view showing the current room, connected topics, and available expansion choices.
- Sidebar or minimap showing visited, unresolved, and revalidation-needed rooms.
- Confirmation dialog for adding cross-links or editing topic structure after Scribe has begun.

---

## 5. Implementation Tasks

### Phase 1: Creation Flow
- [ ] Build root topic creation and room spawn logic.
- [ ] Implement room linking and traversal controls.
- [ ] Add existing-subject resume flow.
- [ ] Show unresolved and visited room states in the map.

### Phase 2: Map Growth
- [ ] Add optional topic suggestions and confirmation UX.
- [ ] Support cross-links and prevent duplicate room identity.
- [ ] Implement post-Scribe revalidation marking.
- [ ] Add topic/room state persistence hooks.

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit Tests | Room creation, link creation, duplicate handling, revalidation flags | Deterministic graph tests |
| Integration Tests | Create-root-to-expand-room workflows and resume existing dungeon flow | Temp project fixtures |

Key test scenarios:
1. Create a root room and expand it into multiple linked rooms.
2. Add a cross-link between two existing rooms and verify graph integrity.
3. Reopen an existing subject and resume Creator state correctly.
4. Edit a room after Scribe starts and confirm impacted rooms become NeedsRevalidation.

---

## 7. Acceptance Criteria

1. User can create a root topic and expand it into connected rooms.
2. User can add and persist cross-links between existing topics.
3. Creator progress is visible through visited, unresolved, and revalidation-needed states.
4. Existing subjects can be reopened and resumed without losing graph state.
5. Post-Scribe graph edits correctly trigger revalidation on impacted rooms.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Should cross-links be directional or visually treated as bidirectional? | Store as directional edges, render as bidirectional when appropriate |
| 2 | Should topic suggestions be deterministic or seeded from external notes/files? | Deterministic, local suggestions only |
