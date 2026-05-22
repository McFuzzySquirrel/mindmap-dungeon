import { useState, type JSX } from "react";

import { FoundationWorkspaceScreen } from "@ui/screens/FoundationWorkspaceScreen";
import { CreatorDungeonScreen } from "@ui/screens/CreatorDungeonScreen";
import { ScribeEncountersScreen } from "@ui/screens/ScribeEncountersScreen";
import { ProgressionScreen } from "@ui/screens/ProgressionScreen";
import { ArchaeologistReviewScreen } from "@ui/screens/ArchaeologistReviewScreen";

export function App(): JSX.Element {
  const [activeScreen, setActiveScreen] = useState<
    "creator" | "foundation" | "scribe" | "progression" | "archaeologist"
  >(
    "creator",
  );

  return (
    <div className="app-shell">
      <header className="app-phase-nav" aria-label="App phase navigation">
        <h1>Mindmap Dungeon</h1>
        <div className="app-phase-actions" role="tablist" aria-label="Phase screens">
          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === "creator"}
            className={activeScreen === "creator" ? "is-active" : ""}
            onClick={() => setActiveScreen("creator")}
          >
            Creator Dungeon
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === "foundation"}
            className={activeScreen === "foundation" ? "is-active" : ""}
            onClick={() => setActiveScreen("foundation")}
          >
            Foundation Workspace
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === "scribe"}
            className={activeScreen === "scribe" ? "is-active" : ""}
            onClick={() => setActiveScreen("scribe")}
          >
            Scribe Encounters
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === "progression"}
            className={activeScreen === "progression" ? "is-active" : ""}
            onClick={() => setActiveScreen("progression")}
          >
            Progression
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === "archaeologist"}
            className={activeScreen === "archaeologist" ? "is-active" : ""}
            onClick={() => setActiveScreen("archaeologist")}
          >
            Archaeologist Review
          </button>
        </div>
      </header>

      {activeScreen === "creator" ? <CreatorDungeonScreen /> : null}
      {activeScreen === "foundation" ? <FoundationWorkspaceScreen /> : null}
      {activeScreen === "scribe" ? <ScribeEncountersScreen /> : null}
      {activeScreen === "progression" ? <ProgressionScreen /> : null}
      {activeScreen === "archaeologist" ? <ArchaeologistReviewScreen /> : null}
    </div>
  );
}
