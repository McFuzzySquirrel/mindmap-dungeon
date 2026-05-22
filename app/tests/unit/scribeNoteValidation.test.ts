import { describe, expect, it } from "vitest";

import { evaluateNoteValidation } from "@core/validation/notes";

function buildWordSequence(count: number, prefix: string): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(" ");
}

function buildValidNote(extraWords = 90): string {
  return [
    "Summary",
    buildWordSequence(45, "summary"),
    "",
    "Key Points",
    buildWordSequence(45, "point"),
    "",
    "Recall Question",
    `How does ${buildWordSequence(extraWords, "recall")} connect to retrieval practice?`,
    "See also [[memory-palace]].",
  ].join("\n");
}

describe("scribe note validation gate", () => {
  it("SCR-FR-02 fails when note is under the 120-word minimum", () => {
    const shortNote = [
      "Summary",
      buildWordSequence(20, "short"),
      "",
      "Key Points",
      buildWordSequence(20, "brief"),
      "",
      "Recall Question",
      "What are the three most important ideas?",
    ].join("\n");

    const result = evaluateNoteValidation({
      noteText: shortNote,
      manualConfirmed: true,
      roomTopic: "Cell Biology",
      referenceTerms: ["mitosis", "meiosis"],
    });

    expect(result.wordCount).toBeLessThan(120);
    expect(result.finalPass).toBe(false);
    expect(result.failedChecks).toContain("VAL_WORD_COUNT_TOO_LOW");
  });

  it("SCR-FR-02 fails when a required section heading is missing", () => {
    const missingSectionNote = [
      "Summary",
      buildWordSequence(70, "summary"),
      "",
      "Key Points",
      buildWordSequence(70, "key"),
      "",
      "No recall prompt section heading exists in this note.",
    ].join("\n");

    const result = evaluateNoteValidation({
      noteText: missingSectionNote,
      manualConfirmed: true,
      roomTopic: "Thermodynamics",
      referenceTerms: ["entropy", "enthalpy"],
    });

    expect(result.wordCount).toBeGreaterThanOrEqual(120);
    expect(result.requiredSectionsPresent).toBe(false);
    expect(result.missingSections).toContain("Recall Question");
    expect(result.finalPass).toBe(false);
    expect(result.failedChecks).toContain("VAL_REQUIRED_SECTION_MISSING");
  });

  it("SCR-FR-02 fails without manual confirmation", () => {
    const result = evaluateNoteValidation({
      noteText: buildValidNote(),
      manualConfirmed: false,
      roomTopic: "Neural Networks",
      referenceTerms: ["gradient", "activation"],
    });

    expect(result.wordCount).toBeGreaterThanOrEqual(120);
    expect(result.requiredSectionsPresent).toBe(true);
    expect(result.finalPass).toBe(false);
    expect(result.failedChecks).toContain("VAL_MANUAL_CONFIRM_REQUIRED");
  });

  it("SCR-FR-06 returns deterministic rubric output structure", () => {
    const input = {
      noteText: buildValidNote(),
      manualConfirmed: true,
      roomTopic: "Photosynthesis",
      referenceTerms: ["chlorophyll", "stroma", "light reactions"],
    } as const;

    const first = evaluateNoteValidation(input);
    const second = evaluateNoteValidation(input);

    expect(first.criterionScores).toEqual(second.criterionScores);
    expect(first.rubric).toEqual(second.rubric);
    expect(first.rubric.map((item) => item.criterion)).toEqual([
      "sectionCompleteness",
      "conceptTermCoverage",
      "linkReferences",
      "recallQuestionQuality",
      "clarityReadability",
    ]);

    for (const criterion of first.rubric) {
      expect(typeof criterion.rationale).toBe("string");
      expect(criterion.rationale.length).toBeGreaterThan(0);
      expect(criterion.score).toBeGreaterThanOrEqual(0);
      expect(criterion.score).toBeLessThanOrEqual(2);
    }
  });
});
