# Platform Baseline

This document defines the architect-owned baseline for Foundation Phase 1.

## Runtime and Build Prerequisites

- Node.js: `>=20.19.0` or `>=22.12.0`
- npm: bundled with supported Node.js versions
- Rust toolchain: stable with `rustc >= 1.77`
- Tauri CLI: managed as an app-local dev dependency
- Linux prerequisites: WebKitGTK and build essentials for Tauri builds
- macOS prerequisites: Xcode command line tools
- Windows prerequisites: WebView2 runtime and Microsoft C++ build tools

## Offline-First and Privacy Defaults

- No cloud SDKs or remote account dependencies are included in the scaffold.
- The app shell performs no network calls by default.
- All persistence will be local filesystem only through `@services/*` contracts.
- Data ownership remains with user-selected local folders.

## Module Boundaries

- `@core/*`: deterministic, UI-agnostic domain logic.
- `@features/*`: feature orchestration and use-case coordination.
- `@ui/*`: rendering and interaction only.
- `@services/*`: infrastructure adapters (filesystem, import/export).

Dependency direction:

1. `@core/*` must never import from `@ui/*`, `@features/*`, or `@services/*`.
2. `@ui/*` must not perform direct filesystem access.
3. `@services/*` must not depend on `@ui/*`.
4. Feature agents own implementation details inside their scoped modules.

## Startup Lifecycle Baseline

1. Browser shell mounts in `src/main.tsx`.
2. Root layout renders in `src/App.tsx` only.
3. Feature wiring occurs later via specialist-owned modules.
4. Persistence and migration behavior are intentionally deferred to foundation-data-engineer.
