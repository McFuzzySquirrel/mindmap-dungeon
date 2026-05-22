import { useState, type JSX } from "react";

import { FoundationWorkspaceScreen } from "@ui/screens/FoundationWorkspaceScreen";
import { CreatorDungeonScreen } from "@ui/screens/CreatorDungeonScreen";

export function App(): JSX.Element {
  const [activeScreen, setActiveScreen] = useState<"creator" | "foundation">("creator");

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
        </div>
      </header>

      {activeScreen === "creator" ? <CreatorDungeonScreen /> : <FoundationWorkspaceScreen />}
    </div>
  );
}
