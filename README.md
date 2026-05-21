# Mindmap Dungeon

Mindmap Dungeon is a local-first desktop learning game that turns studying into a three-phase dungeon loop:

1. Creator: build a topic graph as connected dungeon rooms.
2. Scribe: defeat room encounters by writing structured notes.
3. Archaeologist: revisit the cleared dungeon for exam-style review.

## Vision

The project focuses on helping solo students improve recall before exams through spatial memory, active note creation, and repeat review.

## Core Experience

### Creator
- Start with a root topic room.
- Expand the dungeon by adding connected topics.
- Support cross-links between related topics.

### Scribe
- Each room has an encounter tied to note completion.
- Notes must pass a deterministic quality gate:
	- Minimum 120 words
	- Required sections: Summary, Key Points, Recall Question
	- Manual confirmation
- Rewards: XP and phase badges.

### Archaeologist
- Explore completed dungeons in review mode.
- Collect and read room artifacts.
- Use lightweight self-check prompts for recall.

## Data Model (Local Filesystem)

Mindmap Dungeon stores all project data locally in human-readable files.

```text
dungeon-data/
	<subject-id>/
		dungeon.json
		rooms/
			<room-id>/
				room.json
				notes.txt
				artifact.md
				attachments/
		.backups/
```

Highlights:
- ULID-based IDs for dungeon, room, and attachment entities.
- Schema versioning with backup-first migration policy.
- Strict enum validation for phase states, room states, and edge relation types.
- Retains last 5 backups per subject.

## Tech Direction (v1)

- Desktop shell: Tauri v2
- Frontend: React 19.2
- Build: Vite 8
- Language: TypeScript 6
- Testing: Vitest + Playwright

## Scope (v1)

In scope:
- Single-player desktop experience
- Fully offline operation
- Filesystem-based import/export

Out of scope:
- Multiplayer/co-op
- Cloud sync and accounts
- AI-generated notes or AI grading
- Teacher/classroom workflows

## Product Spec

See the full PRD for detailed requirements, architecture, validation rules, migration semantics, and testing strategy:

- PRD.md

## Status

Planning and specification complete for v1. Implementation scaffolding is the next step.