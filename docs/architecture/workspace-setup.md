# Workspace Setup Baseline

Foundation Phase 1 workspace baseline is implemented under `app/`.

## Included

- Tauri v2 shell under `app/src-tauri/`
- React + Vite + TypeScript app shell under `app/src/`
- Strict TypeScript config with path aliases for architecture boundaries
- Empty feature/core/services/ui folders matching Product Vision section 6.2
- Test directory structure for unit, integration, and e2e layers

## Excluded by Design

- Persistence implementation and migration logic
- Feature business rules for creator, scribe, progression, and archaeologist
- Requirement-specific tests owned by qa-test-engineer and feature agents

## Verification Commands

Run from `app/`:

- `npm install`
- `npm run typecheck`
- `npm run build`
