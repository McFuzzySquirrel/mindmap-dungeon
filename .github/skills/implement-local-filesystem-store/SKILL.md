---
name: implement-local-filesystem-store
description: >
  Implements local-first subject and room persistence with atomic writes, backup retention,
  and migration hooks. Use for filesystem-backed data operations in Mindmap Dungeon.
---

# Skill: Implement Local Filesystem Store

Build robust local persistence behavior for dungeon data, attachments, and backups.

---

## Process

### Step 1: Define Data Contract and Paths

1. Confirm subject and room path conventions.
2. Define JSON schemas and schemaVersion checkpoints.
3. Define typed error codes for load/save/validation failures.

### Step 2: Implement Safe Read/Write Primitives

Use temp-file swap or equivalent atomic strategy:

```ts
export async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const tempPath = `${path}.tmp`;
  const body = JSON.stringify(value, null, 2);
  await fs.writeFile(tempPath, body, "utf8");
  await fs.rename(tempPath, path);
}
```

### Step 3: Add Backup and Migration Hooks

1. Create pre-migration backup snapshot.
2. Retain latest five backups by timestamp.
3. Apply forward-only migration steps and surface restore instructions on failure.

### Step 4: Add Import/Export Roundtrip Support

1. Copy subject folders preserving attachments and artifacts.
2. Validate integrity post-import before making project active.
3. Support explicit overwrite confirmation policy.

### Step 5: Verify Behavior

1. Run unit tests for schema validation, retention pruning, and migration helpers.
2. Run integration tests for create-save-reopen and import-export roundtrip scenarios.
3. Report stable error-code coverage.

---

## Reference

See [Product Vision](../../../docs/product-vision.md) and [Feature: Foundation](../../../docs/features/foundation.md):

- **Product Vision Section 7** - Data safety and NFR constraints
- **Product Vision Section 8** - Filesystem scope and sanitization
- **Foundation Section 3** - FND-FR-01 to FND-FR-05
