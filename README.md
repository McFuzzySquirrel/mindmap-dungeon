# Mindmap Dungeon

A local-first desktop learning game that transforms studying into a three-phase dungeon adventure. Create interconnected topic rooms, write structured notes to defeat encounters, and revisit your dungeon for rapid exam review.

Built with **Tauri**, **React**, **TypeScript**, and **Vite** for a lightweight, offline-first experience.

---

## Features

### Creator: Build Your Dungeon
Create a mindmap as an explorable dungeon of connected rooms. Start with a root topic and expand by linking subtopics. Add cross-links between related concepts to model non-hierarchical relationships.

- Initialize subject dungeons with root topics
- Expand the dungeon with linked room creation
- Add cross-links between existing topics
- Visual progress tracking through visited/unvisited rooms
- Resume interrupted projects without losing state

### Scribe: Defeat Encounters with Notes
Each room has an encounter that requires structured notes. Write notes that pass deterministic quality gates to defeat the encounter and collect artifacts.

- Structured note requirements: Summary, Key Points, Recall Question (min 120 words)
- Immediate validation feedback on unmet criteria
- Artifact generation upon successful completion
- Local persistence of all notes and generated artifacts
- Retry support with draft preservation

### Archaeologist: Review & Revise
Explore your completed dungeon in review mode. Read collected artifacts, use lightweight self-check prompts, and track your revision progress.

- Unlock review mode after completing all rooms
- Traverse completed rooms and inspect artifacts
- Auto-generated self-check prompts from metadata and note headings
- Review streak tracking and engagement metrics
- Markdown artifact rendering with linked attachment support

### Progression & Rewards
Earn XP and badges by completing phases. Track your subject-level progress and export analytics locally.

- Deterministic XP awards per completion event
- Milestone badges for phase achievements
- Local CSV export of progress history
- Per-subject reward totals and timelines

---

## Getting Started

### Prerequisites

- **Node.js** 20.19+ or 22.12+
- **Rust** toolchain (required by Tauri; [install here](https://www.rust-lang.org/))
- **OS-specific dependencies** for Tauri (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites/))
  - **macOS**: Xcode Command Line Tools
  - **Linux**: GTK 3.6+, libssl, build tools
  - **Windows**: Visual Studio Build Tools or full Visual Studio

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/McFuzzySquirrel/mindmap-dungeon.git
cd mindmap-dungeon

# Install Node dependencies in the app directory
cd app
npm install
```

### Running the App

#### Development Mode (with hot reload)
```bash
# From the app directory
npm run dev
```

This opens the app in development mode with hot reload enabled. The Tauri webview will automatically reload when you save changes to TypeScript or React files.

#### Production Build
```bash
# From the app directory
npm run build
```

This creates optimized production binaries in `app/src-tauri/target/release/`.

### Running Tests

Execute the test suite:

```bash
npm run test           # Run unit and integration tests
npm run typecheck      # TypeScript type checking
npm run build          # Full production build (includes typecheck)
```

---

## Project Structure

```
mindmap-dungeon/
├── app/                           # Frontend + Tauri app
│   ├── src/
│   │   ├── core/                  # Domain logic (graph, validation, progression, review)
│   │   │   ├── graph/             # Topic graph construction and traversal
│   │   │   ├── validation/        # Note gates, persistence integrity
│   │   │   ├── artifacts/         # Artifact generation
│   │   │   ├── progression/       # XP, badges, reward tracking
│   │   │   └── review/            # Review mode unlock, prompt generation
│   │   ├── features/              # Feature-specific orchestration
│   │   │   ├── creator/           # Creator dungeon workflows
│   │   │   ├── scribe/            # Scribe encounter coordination
│   │   │   ├── archaeologist/     # Archaeologist review flows
│   │   │   └── progression/       # Progression analytics
│   │   ├── ui/                    # React screens and components
│   │   │   ├── screens/           # Full-page views (Creator, Scribe, etc.)
│   │   │   └── components/        # Reusable UI components
│   │   ├── services/              # External integrations
│   │   │   ├── fileStore/         # Local filesystem persistence
│   │   │   ├── importExport/      # Backup and import workflows
│   │   │   ├── settings/          # User preferences
│   │   │   └── progressExport/    # CSV analytics export
│   │   └── App.tsx                # Root component and phase routing
│   ├── src-tauri/                 # Tauri backend and configuration
│   ├── tests/                     # Test suites
│   │   ├── unit/                  # Unit tests for domain logic
│   │   ├── integration/           # File I/O and multi-component tests
│   │   └── e2e/                   # End-to-end tests
│   └── package.json
├── docs/                          # Documentation
│   ├── product-vision.md          # Product vision and feature overview
│   ├── architecture/              # Architecture documentation
│   └── features/                  # Feature PRDs
├── LICENSE
└── README.md
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop Shell | Tauri | v2.x |
| Frontend | React | 19.2 |
| Build Tool | Vite | 8.0.x |
| Language | TypeScript | 6.0 |
| Testing | Vitest + Playwright | Latest |
| Storage | Local Filesystem | JSON + Markdown |
| Runtime | Node.js | 20.19+ or 22.12+ |

---

## Architecture Principles

### Local-First & Offline
All data is stored in human-readable files on your filesystem. No cloud services or network connectivity required. Dungeon data is structured as JSON metadata with markdown notes and attachments.

### Deterministic & Verifiable
Game logic is deterministic and offline-safe. No AI-assisted grading or external APIs. Note validation rules and XP formulas are explicit and auditable.

### Atomic & Safe
Core save operations use atomic writes with pre-operation backup. Schema migrations are versioned with rollback support. Crashes or forced-closes cannot corrupt previously saved work.

### Testable & Maintainable
Domain logic is separated from UI. Core algorithms are unit-tested independently. Integration tests verify file I/O and multi-component workflows.

---

## Data Format

All dungeon data is stored in local directories with human-readable files:

```
dungeon-data/
└── <subject-id>/
    ├── dungeon.json              # Graph metadata and room structure
    ├── rooms/
    │   └── <room-id>/
    │       ├── room.json         # Room metadata and state
    │       ├── notes.txt         # User-written notes
    │       ├── artifact.md       # Generated review content
    │       └── attachments/      # Optional linked files
    └── .backups/                 # Automatic backup snapshots (latest 5)
```

Files are Git-friendly and can be versioned. Import/export support makes it easy to back up or migrate projects.

---

## Development

### Code Organization
- **`core/`** — Pure business logic with minimal dependencies. Fully testable offline.
- **`features/`** — Feature orchestration and state management. Consumes core logic and wires services.
- **`ui/`** — React components. Consumes feature contracts and renders domain state.
- **`services/`** — External integrations (filesystem, settings, exports).

### Adding Features
New gameplay phases or mechanics should:
1. Add domain logic under `core/`
2. Create feature orchestration under `features/`
3. Implement UI under `ui/screens/`
4. Add unit tests for domain logic
5. Add integration tests for file I/O and workflows

### Code Style
- Use TypeScript strict mode with `exactOptionalPropertyTypes`
- Keep functions pure and testable
- Use descriptive type names and explicit error codes
- Document complex algorithms and domain concepts

---

## Learn More

- **[Product Vision](docs/product-vision.md)** — Feature overview, design principles, and roadmap
- **[PRD](PRD.md)** — Complete requirements and specifications
- **[Architecture Guide](docs/architecture/)** — Platform baseline and workspace setup
- **[Feature Docs](docs/features/)** — Detailed requirements for each feature

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## Support

For questions, bug reports, or feature requests, please open an issue on [GitHub](https://github.com/McFuzzySquirrel/mindmap-dungeon).