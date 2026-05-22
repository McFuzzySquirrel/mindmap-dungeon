# Feature: Progression

## Traceability

| Feature ID | Original PRD ID | Description |
|-----------|----------------|-------------|
| PRG-US-01 | US-05 | Receive XP and badges by phase and subject |
| PRG-FR-01 | PR-01, SC-05 | Award per-room XP using the defined formula and update badge state after room completion |
| PRG-FR-02 | PR-02 | Issue phase completion badges at defined thresholds |
| PRG-FR-03 | PR-03, PR-04 | Maintain rank tiers and show reward history |
| PRG-FR-04 | PR-05, analytics section | Display XP breakdown and local CSV export of progress metrics |

**Product Vision:** [docs/product-vision.md](../product-vision.md)  
**Original PRD:** [docs/PRD.md](../PRD.md)

---

## 1. Feature Overview

**Feature Name:** Progression  
**ID Prefix:** PRG  
**Summary:** Track XP, badges, rank tiers, and progress exports so the learner can see durable motivation and study momentum.  
**Dependencies:** Foundation, Scribe Encounters  
**Priority:** Should

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| PRG-US-01 | solo student | receive XP and badges by phase and subject | I stay motivated and can track progress | Should |

---

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| PRG-FR-01 | System shall award per-room XP using formula: 20 base XP + quality bonus (0-10) + streak bonus (0-5). | Must |
| PRG-FR-02 | System shall issue phase completion badges per subject at the configured thresholds for Creator, Scribe, and Archaeologist. | Must |
| PRG-FR-03 | System shall maintain subject rank tiers based on cumulative XP and display reward history in the subject dashboard. | Should |
| PRG-FR-04 | System shall display an XP breakdown after each room clear and support local CSV export of progress metrics. | Should |

---

## 4. UI / Interaction Design

- Subject dashboard progress panel showing XP, badge state, and rank tier.
- Reward breakdown toast or panel after each room clear.
- Local export action for CSV progress data.
- Reward history timeline for subject-level milestones.

---

## 5. Implementation Tasks

### Phase 1: Reward Engine
- [ ] Build deterministic XP calculation and reward event model.
- [ ] Implement phase badge thresholds and rank tier logic.
- [ ] Capture reward events from feature hooks.

### Phase 2: Progress UI and Export
- [ ] Build subject dashboard reward panel and XP breakdown view.
- [ ] Add reward history timeline.
- [ ] Implement local CSV export for progress metrics.

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit Tests | XP formula, badge thresholds, rank tiers, CSV generation | Deterministic progression fixtures |
| Integration Tests | Reward emission from other features and dashboard rendering | Mock feature events |

Key test scenarios:
1. Award XP for a cleared room and verify the total breakdown.
2. Confirm badges unlock only at the configured thresholds.
3. Verify rank tiers update as cumulative XP increases.
4. Export local CSV data and validate the contents.

---

## 7. Acceptance Criteria

1. XP is awarded using the defined deterministic formula.
2. Badge unlocks happen only when their thresholds are met.
3. Rank tiers and reward history are visible in the UI.
4. Progress metrics can be exported locally to CSV.
5. Reward totals match the breakdown shown to the user.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Should rank tier labels be user-facing fantasy terms or study-centric titles? | Study-centric titles in v1 |
| 2 | Should CSV exports include raw event logs or only summary metrics? | Summary metrics only |
