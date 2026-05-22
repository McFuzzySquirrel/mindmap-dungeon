import { describe, expect, it } from "vitest";

import {
  deriveValidationFailureCodes,
  validateValidationState,
} from "@core/validation/persistence";

describe("persistence validation", () => {
  it("accepts deterministic quality bonus contract", () => {
    expect(() =>
      validateValidationState({
        wordCount: 140,
        requiredSectionsPresent: true,
        manualConfirmed: true,
        criterionScores: {
          sectionCompleteness: 2,
          conceptTermCoverage: 2,
          linkReferences: 1,
          recallQuestionQuality: 2,
          clarityReadability: 1,
        },
        failedChecks: [],
        qualityBonus: 8,
        finalPass: true,
      }),
    ).not.toThrow();
  });

  it("rejects mismatched quality bonus", () => {
    expect(() =>
      validateValidationState({
        wordCount: 140,
        requiredSectionsPresent: true,
        manualConfirmed: true,
        criterionScores: {
          sectionCompleteness: 2,
          conceptTermCoverage: 2,
          linkReferences: 1,
          recallQuestionQuality: 2,
          clarityReadability: 1,
        },
        failedChecks: [],
        qualityBonus: 7,
        finalPass: true,
      }),
    ).toThrow(/qualityBonus must equal sum of criterionScores/);
  });

  it("accepts failed gate metadata while deriving stable failure codes", () => {
    const state = {
      wordCount: 100,
      requiredSectionsPresent: false,
      manualConfirmed: false,
      criterionScores: {
        sectionCompleteness: 1,
        conceptTermCoverage: 1,
        linkReferences: 1,
        recallQuestionQuality: 1,
        clarityReadability: 1,
      },
      failedChecks: ["min_word_count", "missing_recall_question"],
      qualityBonus: 5,
      finalPass: false,
    };

    expect(() => validateValidationState(state)).not.toThrow();
    expect(deriveValidationFailureCodes(state)).toEqual([
      "VAL_WORD_COUNT_TOO_LOW",
      "VAL_REQUIRED_SECTION_MISSING",
      "VAL_MANUAL_CONFIRM_REQUIRED",
    ]);
  });
});
