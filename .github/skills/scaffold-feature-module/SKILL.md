---
name: scaffold-feature-module
description: >
  Scaffolds a new Mindmap Dungeon feature module with aligned core, feature, UI, and
  test entry points. Use when introducing a new feature area or extending phase-specific modules.
---

# Skill: Scaffold Feature Module

Create a consistent module skeleton for new features so architecture boundaries remain stable.

---

## Process

### Step 1: Confirm Feature Scope and Ownership

1. Read feature requirements and identify the owning agent.
2. Confirm target paths across:
   - `app/src/core/<domain>/`
   - `app/src/features/<feature>/`
   - `app/src/ui/screens/<feature>/` (if UI is required)
   - `app/tests/unit/<feature>/` and `app/tests/integration/<feature>/`
3. Ensure no overlap with existing owned directories.

### Step 2: Generate Baseline Files

Create baseline files with explicit contracts:

```ts
// app/src/features/<feature>/index.ts
export interface <FeatureName>Input {
  subjectId: string;
}

export interface <FeatureName>Result {
  ok: boolean;
}

export function run<FeatureName>(input: <FeatureName>Input): <FeatureName>Result {
  return { ok: true };
}
```

```ts
// app/src/core/<domain>/types.ts
export type <Domain>Id = string;

export interface <Domain>State {
  status: "idle" | "active" | "complete";
}
```

### Step 3: Add Test Skeletons

1. Add one unit test per exported core function.
2. Add one integration test for happy-path feature workflow.
3. Use requirement IDs in test names where available.

### Step 4: Validate and Report

1. Run lint, type checks, and feature-scoped tests.
2. Provide created file list and ownership alignment summary.

---

## Reference

See [Product Vision](../../../docs/product-vision.md) for architecture and module boundaries:

- **Section 6.2** - Project structure and layout
- **Section 14** - Feature set and dependency order
