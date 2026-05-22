import type { GraphDomainResult, TopicSuggestion, TopicSuggestionInput } from "./types";
import { normalizeTopicKey } from "./graphDomain";

const DEFAULT_MAX_SUGGESTIONS = 5;

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase())
    .join(" ");
}

function extractAnchorTopic(sourceTopic: string): string {
  const trimmed = sourceTopic.trim();
  if (trimmed.length === 0) {
    return "Topic";
  }

  const stripped = trimmed
    .replace(/^(intro(duction)?\s+to\s+)/i, "")
    .replace(/^(basics\s+of\s+)/i, "")
    .replace(/^(fundamentals\s+of\s+)/i, "")
    .trim();

  if (stripped.length === 0) {
    return toTitleCase(trimmed);
  }

  return toTitleCase(stripped);
}

function dedupeAndFilterSuggestions(
  suggestions: readonly TopicSuggestion[],
  existingTopicKeys: ReadonlySet<string>,
  maxSuggestions: number,
): TopicSuggestion[] {
  const seen = new Set<string>();
  const filtered: TopicSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (existingTopicKeys.has(suggestion.normalizedTopicKey)) {
      continue;
    }

    if (seen.has(suggestion.normalizedTopicKey)) {
      continue;
    }

    seen.add(suggestion.normalizedTopicKey);
    filtered.push(suggestion);

    if (filtered.length >= maxSuggestions) {
      break;
    }
  }

  return filtered;
}

export function suggestConnectedTopics(
  input: TopicSuggestionInput,
): GraphDomainResult<TopicSuggestion[]> {
  const sourceTopic = input.sourceTopic.trim();
  if (sourceTopic.length === 0) {
    return {
      ok: false,
      error: {
        code: "EMPTY_TOPIC",
        message: "Source topic must be non-empty for suggestions.",
      },
    };
  }

  const anchor = extractAnchorTopic(sourceTopic);
  const maxSuggestions = input.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;

  const existingTopicKeys = new Set(
    input.existingRooms.map((room) => normalizeTopicKey(room.topic)),
  );

  const draft = [
    {
      topic: `${anchor} Foundations`,
      reason: "decomposition" as const,
    },
    {
      topic: `Core Concepts of ${anchor}`,
      reason: "decomposition" as const,
    },
    {
      topic: `Prerequisites for ${anchor}`,
      reason: "prerequisite" as const,
    },
    {
      topic: `${anchor} in Practice`,
      reason: "application" as const,
    },
    {
      topic: `${anchor} vs Related Concepts`,
      reason: "comparison" as const,
    },
    {
      topic: `Common Mistakes in ${anchor}`,
      reason: "review" as const,
    },
    {
      topic: `${anchor} Summary and Review`,
      reason: "review" as const,
    },
  ].map((entry) => {
    const topic = entry.topic.trim();
    return {
      topic,
      reason: entry.reason,
      normalizedTopicKey: normalizeTopicKey(topic),
    };
  });

  return {
    ok: true,
    value: dedupeAndFilterSuggestions(draft, existingTopicKeys, Math.max(1, maxSuggestions)),
  };
}
