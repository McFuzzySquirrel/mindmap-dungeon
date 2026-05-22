import { describe, expect, it } from "vitest";

import { toPersistenceError } from "@core/error-catalog";
import { buildActionableWarning } from "@ui/screens/foundationWarnings";

describe("foundation warnings", () => {
  it("maps persistence errors from the catalog", () => {
    const warning = buildActionableWarning(
      toPersistenceError("IO_WRITE_FAILED"),
      "Export failed",
    );

    expect(warning.title).toBe("Export failed");
    expect(warning.code).toBe("IO_WRITE_FAILED");
    expect(warning.message).toBe("Failed to write data to disk.");
    expect(warning.remediation).toMatch(/disk space/i);
  });

  it("adds backup guidance for migration failures", () => {
    const warning = buildActionableWarning(
      toPersistenceError("MIGRATION_FAILED"),
      "Migration failed",
    );

    expect(warning.backupGuidance).toMatch(/restore from the newest snapshot/i);
  });

  it("falls back for non-persistence errors", () => {
    const warning = buildActionableWarning(new Error("boom"), "Unknown failure");

    expect(warning.title).toBe("Unknown failure");
    expect(warning.message).toBe("boom");
    expect(warning.code).toBeUndefined();
  });
});