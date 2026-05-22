---
name: create-feature-test-suite
description: >
  Builds traceable unit, integration, and e2e test suites from feature requirements.
  Use when adding or expanding automated verification for Mindmap Dungeon features.
---

# Skill: Create Feature Test Suite

Translate feature requirements into deterministic tests with clear traceability.

---

## Process

### Step 1: Build Requirement-to-Test Matrix

1. List all feature functional requirements.
2. Map each requirement to at least one test level:
   - Unit for pure logic
   - Integration for module interaction
   - E2E for user-critical journeys

### Step 2: Generate Unit and Integration Tests

```ts
describe("<REQ-ID>", () => {
  it("enforces expected behavior", () => {
    // Arrange
    // Act
    // Assert
  });
});
```

1. Use deterministic fixtures.
2. Cover both happy and failure paths.
3. Prefer explicit assertions over snapshots for business rules.

### Step 3: Add End-to-End Coverage for Primary Paths

1. Cover create -> scribe -> progression -> review happy path.
2. Cover one critical failure-recovery path per feature.
3. Include keyboard/focus checks on primary screens.

### Step 4: Validate and Report Coverage

1. Run lint, unit, integration, and e2e checks relevant to changed features.
2. Report which requirement IDs are covered and any remaining gaps.

---

## Reference

See [Product Vision](../../../docs/product-vision.md) and all feature test strategy sections:

- **Product Vision Section 6.1** - Testing stack baseline
- **Product Vision Section 9** - Accessibility expectations
- **Feature Sections 6** in foundation, creator-dungeon, scribe-encounters, progression, and archaeologist-review
