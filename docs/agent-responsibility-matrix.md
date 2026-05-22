# Agent Responsibility Matrix

This matrix validates ownership coverage for all functional requirements across `docs/features/`.

## Validation Result

- Scope validated: all feature functional requirements (`FND-FR-*`, `CRT-FR-*`, `SCR-FR-*`, `PRG-FR-*`, `ARC-FR-*`).
- Total requirements mapped: 28/28.
- Primary ownership rule: satisfied (each requirement has exactly one primary owner agent).
- Ownership gaps: none.
- Conflicting ownership: none identified.

Notes on cross-feature collaboration:
- `ARC-FR-04` is primarily owned by `archaeologist-review-engineer` (event generation/tracking in review flow). `progression-systems-engineer` is a downstream consumer that integrates those events into progression analytics payloads; this is collaboration, not conflicting ownership.

## Requirement-to-Agent Matrix

| Requirement ID | Feature | Requirement (Short) | Primary Owner Agent | Supporting Agents | Ownership Rationale |
|---|---|---|---|---|---|
| FND-FR-01 | Foundation | Local filesystem persistence + import/export | foundation-data-engineer | project-architect, ui-accessibility-engineer, qa-test-engineer | Persistence/import-export is explicitly owned in `app/src/services/fileStore/` and `app/src/services/importExport/`. |
| FND-FR-02 | Foundation | Open existing subject and resume state | foundation-data-engineer | creator-graph-engineer, ui-accessibility-engineer, qa-test-engineer | Resume/load semantics are core persistence responsibilities. |
| FND-FR-03 | Foundation | Attachments + backup snapshot retention | foundation-data-engineer | archaeologist-review-engineer, ui-accessibility-engineer, qa-test-engineer | Backup/attachment storage and retention are explicitly owned in data safety modules. |
| FND-FR-04 | Foundation | schemaVersion + ULID + integrity constraints | foundation-data-engineer | project-architect, qa-test-engineer | Validation/migration integrity checks are explicitly assigned to persistence validation modules. |
| FND-FR-05 | Foundation | Room metadata/enums/quality contract/error mapping | foundation-data-engineer | scribe-encounters-engineer, qa-test-engineer | Persistence-side validation and stable error mapping are explicitly owned by foundation data layer. |
| CRT-FR-01 | Creator Dungeon | Create subject dungeon with root room | creator-graph-engineer | foundation-data-engineer, ui-accessibility-engineer, qa-test-engineer | Root-room graph initialization is explicitly owned in `app/src/core/graph/`. |
| CRT-FR-02 | Creator Dungeon | Create linked rooms from connected topics | creator-graph-engineer | foundation-data-engineer, ui-accessibility-engineer, qa-test-engineer | Graph mutation and edge creation are creator graph domain responsibilities. |
| CRT-FR-03 | Creator Dungeon | Cross-links with graph integrity | creator-graph-engineer | foundation-data-engineer, ui-accessibility-engineer, qa-test-engineer | Cross-link operations and graph integrity constraints are explicit creator ownership. |
| CRT-FR-04 | Creator Dungeon | Prevent duplicate room identity/topic uniqueness | creator-graph-engineer | foundation-data-engineer, qa-test-engineer | Duplicate prevention is explicitly listed under creator graph operations. |
| CRT-FR-05 | Creator Dungeon | Show unresolved/unvisited creation progress | creator-graph-engineer | ui-accessibility-engineer, qa-test-engineer | Derivation of traversal/progress state is creator logic; UI renders it. |
| CRT-FR-06 | Creator Dungeon | Optional suggestions with explicit confirmation | creator-graph-engineer | ui-accessibility-engineer, qa-test-engineer | Suggestion integration and confirmation gates are creator flow responsibilities. |
| CRT-FR-07 | Creator Dungeon | Post-scribe graph edit revalidation flags | creator-graph-engineer | scribe-encounters-engineer, ui-accessibility-engineer, qa-test-engineer | Revalidation propagation after graph edits is explicitly creator ownership. |
| SCR-FR-01 | Scribe Encounters | One encounter per room | scribe-encounters-engineer | creator-graph-engineer, foundation-data-engineer, ui-accessibility-engineer, qa-test-engineer | Encounter lifecycle orchestration is explicit scribe ownership. |
| SCR-FR-02 | Scribe Encounters | Deterministic note gate (word count/sections/confirm) | scribe-encounters-engineer | ui-accessibility-engineer, qa-test-engineer | Note gate checks and orchestration are explicit scribe/validation ownership. |
| SCR-FR-03 | Scribe Encounters | Mark defeated + generate artifact on pass | scribe-encounters-engineer | foundation-data-engineer, archaeologist-review-engineer, progression-systems-engineer, qa-test-engineer | Pass transitions + artifact generation pipeline are explicit scribe ownership. |
| SCR-FR-04 | Scribe Encounters | Fail feedback + retry without data loss | scribe-encounters-engineer | foundation-data-engineer, ui-accessibility-engineer, qa-test-engineer | Retry behavior and unmet-criteria feedback are explicit scribe ownership. |
| SCR-FR-05 | Scribe Encounters | Post-completion note revision/re-save | scribe-encounters-engineer | foundation-data-engineer, ui-accessibility-engineer, qa-test-engineer | Revision/resave behavior after clear is explicit scribe ownership. |
| SCR-FR-06 | Scribe Encounters | Compute 5-criterion quality bonus | scribe-encounters-engineer | progression-systems-engineer, qa-test-engineer | Rubric scoring is explicit scribe validation ownership; progression consumes output. |
| SCR-FR-07 | Scribe Encounters | Idempotent completion (no duplicate artifacts/rewards) | scribe-encounters-engineer | progression-systems-engineer, foundation-data-engineer, qa-test-engineer | Idempotency guard in encounter completion is explicit scribe ownership. |
| PRG-FR-01 | Progression | Per-room XP formula | progression-systems-engineer | scribe-encounters-engineer, ui-accessibility-engineer, qa-test-engineer | Deterministic reward computation is explicit progression engine ownership. |
| PRG-FR-02 | Progression | Phase completion badges | progression-systems-engineer | scribe-encounters-engineer, archaeologist-review-engineer, ui-accessibility-engineer, qa-test-engineer | Badge threshold logic is explicitly owned in progression core. |
| PRG-FR-03 | Progression | Rank tiers + reward history | progression-systems-engineer | ui-accessibility-engineer, foundation-data-engineer, qa-test-engineer | Rank and reward-history models are explicit progression responsibilities. |
| PRG-FR-04 | Progression | XP breakdown + local CSV export | progression-systems-engineer | ui-accessibility-engineer, foundation-data-engineer, qa-test-engineer | Breakdown payload + export pipeline are explicit progression ownership. |
| ARC-FR-01 | Archaeologist Review | Unlock review mode at Scribe threshold | archaeologist-review-engineer | progression-systems-engineer, ui-accessibility-engineer, qa-test-engineer | Unlock gating logic for review mode is explicit archaeologist ownership. |
| ARC-FR-02 | Archaeologist Review | Traverse completed rooms and open artifacts | archaeologist-review-engineer | foundation-data-engineer, ui-accessibility-engineer, qa-test-engineer | Review traversal and artifact browsing flow are explicit archaeologist ownership. |
| ARC-FR-03 | Archaeologist Review | Generate offline self-check prompts | archaeologist-review-engineer | ui-accessibility-engineer, qa-test-engineer | Prompt generation from room metadata is explicit archaeologist ownership. |
| ARC-FR-04 | Archaeologist Review | Track review streaks/counts for analytics | archaeologist-review-engineer | progression-systems-engineer, qa-test-engineer | Primary ownership is event tracking/emission in review domain; progression integrates emitted data downstream. |
| ARC-FR-05 | Archaeologist Review | Render markdown artifacts with linked attachments | archaeologist-review-engineer | ui-accessibility-engineer, foundation-data-engineer, qa-test-engineer | Artifact rendering contracts in review flow are explicitly archaeologist-owned. |

## Feature Coverage Summary

| Feature | Requirement IDs | Primary Owner Agent |
|---|---|---|
| Foundation | FND-FR-01 to FND-FR-05 | foundation-data-engineer |
| Creator Dungeon | CRT-FR-01 to CRT-FR-07 | creator-graph-engineer |
| Scribe Encounters | SCR-FR-01 to SCR-FR-07 | scribe-encounters-engineer |
| Progression | PRG-FR-01 to PRG-FR-04 | progression-systems-engineer |
| Archaeologist Review | ARC-FR-01 to ARC-FR-05 | archaeologist-review-engineer |

## Cross-Cutting Owners (Non-Primary Requirement Ownership)

| Agent | Cross-Cutting Scope |
|---|---|
| project-architect | Platform scaffolding, architecture boundaries, and global non-functional governance. |
| ui-accessibility-engineer | UI composition and accessibility conformance (`ACC-01` to `ACC-04`) across all features. |
| qa-test-engineer | Test ownership and requirement-to-test traceability for all feature requirement sets. |

## How to Use This Matrix

- Use the `Primary Owner Agent` as the single accountability point for implementation decisions per requirement.
- Use `Supporting Agents` for contracts, integrations, and verification only.
- If new requirements are added, append rows and keep the single-primary-owner rule intact.
