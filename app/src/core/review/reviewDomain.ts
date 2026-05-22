import type {
  ArtifactPresentationContract,
  ArtifactPresentationInput,
  BuildReviewRoomReviewedEventInput,
  BuildReviewTraversalInput,
  ReviewAnalyticsSnapshot,
  ReviewCountsInput,
  ReviewRoomReviewedEvent,
  ReviewTraversalRoom,
  ReviewTraversalSnapshot,
  ReviewUnlockInput,
  ReviewUnlockStatus,
  SelfCheckPrompt,
  SelfCheckPromptInput,
} from "./types";
import { REVIEWABLE_ROOM_STATES } from "./types";

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeAttachmentPath(value: string): string {
  let normalized = value.trim().replace(/\\/g, "/");

  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  while (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }

  return normalized;
}

function basename(pathLike: string): string {
  const normalized = pathLike.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];
  return last ?? normalized;
}

function isLocalLink(href: string): boolean {
  const value = href.trim();
  if (value.length === 0 || value.startsWith("#") || value.startsWith("//")) {
    return false;
  }

  return !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function isReviewableState(state: string): boolean {
  return REVIEWABLE_ROOM_STATES.includes(state as (typeof REVIEWABLE_ROOM_STATES)[number]);
}

export function isReviewableRoom(room: {
  state: string;
  validationState: { finalPass: boolean };
}): boolean {
  return room.validationState.finalPass && isReviewableState(room.state);
}

export function evaluateReviewUnlock(input: ReviewUnlockInput): ReviewUnlockStatus {
  const totalRooms = input.dungeon.rooms.length;
  const clearedRooms = input.dungeon.rooms.reduce((total, summary) => {
    const room = input.rooms[summary.roomId];
    if (!room) {
      return total;
    }

    return total + (isReviewableRoom(room) ? 1 : 0);
  }, 0);

  const requiredCompletionRatio = clampRatio(input.requiredCompletionRatio ?? 1);
  const completionRatio = totalRooms > 0 ? clearedRooms / totalRooms : 0;

  return {
    requiredCompletionRatio,
    completionRatio,
    totalRooms,
    clearedRooms,
    unlocked: totalRooms > 0 && completionRatio >= requiredCompletionRatio,
  };
}

export function buildReviewTraversal(input: BuildReviewTraversalInput): ReviewTraversalSnapshot {
  const roomsById: Record<string, ReviewTraversalRoom> = {};
  const orderedRoomIds: string[] = [];
  let reviewedRoomCount = 0;

  for (const summary of input.dungeon.rooms) {
    const room = input.rooms[summary.roomId];
    if (!room || !isReviewableRoom(room)) {
      continue;
    }

    const reviewPassCount = toNonNegativeInteger(room.reviewPassCount);
    if (reviewPassCount > 0) {
      reviewedRoomCount += 1;
    }

    orderedRoomIds.push(room.roomId);
    roomsById[room.roomId] = {
      roomId: room.roomId,
      topic: room.topic,
      state: room.state,
      reviewPassCount,
      attachmentCount: room.attachments.length,
    };
  }

  return {
    orderedRoomIds,
    roomsById,
    totalReviewableRooms: orderedRoomIds.length,
    reviewedRoomCount,
  };
}

export function buildArtifactPresentationContract(
  input: ArtifactPresentationInput,
): ArtifactPresentationContract {
  const attachmentByKey = new Map<string, string>();
  for (const attachment of input.attachments) {
    const normalizedRelativePath = normalizeAttachmentPath(attachment.relativePath);
    attachmentByKey.set(normalizedRelativePath, attachment.attachmentId);
    attachmentByKey.set(normalizeAttachmentPath(attachment.fileName), attachment.attachmentId);
    attachmentByKey.set(normalizeAttachmentPath(basename(attachment.relativePath)), attachment.attachmentId);
  }

  const localResolvedAttachmentIds = new Set<string>();
  const unresolvedLocalLinks: string[] = [];
  const linkReferences: ArtifactPresentationContract["linkReferences"] = [];

  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match = markdownLinkPattern.exec(input.markdown);
  while (match) {
    const label = match[1]?.trim() ?? "";
    const href = match[2]?.trim() ?? "";
    const local = isLocalLink(href);

    let attachmentId: string | undefined;
    if (local) {
      const normalizedHref = normalizeAttachmentPath(href);
      const resolved = attachmentByKey.get(normalizedHref);
      if (resolved) {
        attachmentId = resolved;
        localResolvedAttachmentIds.add(resolved);
      } else if (!unresolvedLocalLinks.includes(href)) {
        unresolvedLocalLinks.push(href);
      }
    }

    linkReferences.push({
      label,
      href,
      isLocal: local,
      isResolved: local ? Boolean(attachmentId) : true,
      ...(attachmentId ? { attachmentId } : {}),
    });

    match = markdownLinkPattern.exec(input.markdown);
  }

  const attachments = input.attachments.map((attachment) => ({
    attachmentId: attachment.attachmentId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    relativePath: attachment.relativePath,
    isLinkedInMarkdown: localResolvedAttachmentIds.has(attachment.attachmentId),
  }));

  return {
    roomId: input.roomId,
    markdown: input.markdown,
    linkReferences,
    attachments,
    unresolvedLocalLinks,
  };
}

function cleanHeading(value: string): string {
  return value
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

export function extractMarkdownHeadings(markdown: string): string[] {
  const headings: string[] = [];
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim().startsWith("#")) {
      continue;
    }

    const heading = cleanHeading(line);
    if (heading.length > 0 && !headings.includes(heading)) {
      headings.push(heading);
    }
  }

  return headings;
}

export function generateSelfCheckPrompts(input: SelfCheckPromptInput): SelfCheckPrompt[] {
  const maxPromptCount = Math.min(8, Math.max(1, toNonNegativeInteger(input.maxPromptCount || 4)));
  const prompts: SelfCheckPrompt[] = [];

  prompts.push({
    promptId: `${input.roomId}:prompt:1`,
    source: "topic",
    text: `In one minute, explain how ${input.roomTopic} fits into ${input.subjectName}.`,
  });

  const primaryRelatedTopic = input.relatedTopics[0];
  if (primaryRelatedTopic) {
    prompts.push({
      promptId: `${input.roomId}:prompt:2`,
      source: "relation",
      text: `How does ${input.roomTopic} connect to ${primaryRelatedTopic} during problem solving?`,
    });
  }

  const headings = input.noteHeadings.map(cleanHeading).filter((heading) => heading.length > 0);
  for (const heading of headings) {
    const nextIndex = prompts.length + 1;
    prompts.push({
      promptId: `${input.roomId}:prompt:${nextIndex}`,
      source: "heading",
      text: `Without looking, summarize '${heading}' from your ${input.roomTopic} notes.`,
    });
  }

  if (prompts.length < maxPromptCount) {
    prompts.push({
      promptId: `${input.roomId}:prompt:${prompts.length + 1}`,
      source: "topic",
      text: `State one exam-style question where ${input.roomTopic} is the core concept and outline your answer.`,
    });
  }

  return prompts.slice(0, maxPromptCount);
}

export function summarizeReviewAnalytics(input: ReviewCountsInput): ReviewAnalyticsSnapshot {
  const reviewableSet = new Set(input.reviewableRoomIds);
  let reviewSessionCount = 0;
  let reviewedRoomCount = 0;

  for (const [roomId, room] of Object.entries(input.rooms)) {
    if (!reviewableSet.has(roomId)) {
      continue;
    }

    const count = toNonNegativeInteger(room.reviewPassCount);
    reviewSessionCount += count;
    if (count > 0) {
      reviewedRoomCount += 1;
    }
  }

  const totalReviewableRooms = input.reviewableRoomIds.length;
  const fullReviewPasses =
    totalReviewableRooms > 0 ? Math.trunc(reviewSessionCount / totalReviewableRooms) : 0;

  return {
    reviewSessionCount,
    fullReviewPasses,
    currentReviewStreak: toNonNegativeInteger(input.currentReviewStreak),
    longestReviewStreak: toNonNegativeInteger(input.longestReviewStreak),
    reviewedRoomCount,
    totalReviewableRooms,
  };
}

export function buildReviewRoomReviewedEvent(
  input: BuildReviewRoomReviewedEventInput,
): ReviewRoomReviewedEvent {
  const sequence = toNonNegativeInteger(input.sequence);

  return {
    eventId: `${input.subjectId}:${input.roomId}:${input.occurredAt}:review:${sequence}`,
    eventType: "ROOM_REVIEWED",
    subjectId: input.subjectId,
    dungeonId: input.dungeonId,
    roomId: input.roomId,
    occurredAt: input.occurredAt,
    reviewSessionCount: toNonNegativeInteger(input.analytics.reviewSessionCount),
    fullReviewPasses: toNonNegativeInteger(input.analytics.fullReviewPasses),
    currentReviewStreak: toNonNegativeInteger(input.analytics.currentReviewStreak),
    longestReviewStreak: toNonNegativeInteger(input.analytics.longestReviewStreak),
  };
}
