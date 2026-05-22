---
name: implement-deterministic-ruleset
description: >
  Implements deterministic rule evaluation for note validation, quality scoring,
  and progression formulas. Use when adding or changing gate/rubric/reward logic.
---

# Skill: Implement Deterministic Ruleset

Create predictable, testable rule engines for encounter validation and progression rewards.

---

## Process

### Step 1: Capture Rule Inputs and Outputs

1. Define typed input payloads and result payloads.
2. Include structured reason codes for failed conditions.
3. Keep side effects out of rule functions.

### Step 2: Implement Pure Rule Functions

```ts
export interface RuleResult {
  pass: boolean;
  reasons: string[];
  score?: number;
}

export function evaluateRules(input: RuleInput): RuleResult {
  const reasons: string[] = [];
  // Evaluate each condition deterministically in fixed order.
  return { pass: reasons.length === 0, reasons };
}
```

### Step 3: Add Composition Layer

1. Compose gate checks, rubric scoring, and reward formulas from pure helpers.
2. Ensure formula constants are explicit and centrally defined.
3. Return full breakdown objects for UI and analytics consumers.

### Step 4: Add Deterministic Tests

1. Table-drive tests for boundary conditions.
2. Add idempotency tests where completion logic depends on rules.
3. Verify output stability for identical inputs.

### Step 5: Verify and Document

1. Run rule-focused unit and integration suites.
2. Document formula and reason-code changes in commit/report summary.

---

## Reference

See [Feature: Scribe Encounters](../../../docs/features/scribe-encounters.md) and [Feature: Progression](../../../docs/features/progression.md):

- **Scribe Section 3** - SCR-FR-02, SCR-FR-06, SCR-FR-07
- **Progression Section 3** - PRG-FR-01 to PRG-FR-04
