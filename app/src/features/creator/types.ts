import type {
  AddCrossLinkInput,
  AddLinkedRoomsInput,
  CreatorTraversalSnapshot,
  GraphDomainError,
  TopicSuggestion,
} from "@core/graph";
import type {
  DungeonMetadata,
  RoomMetadata,
} from "@core/validation/persistence";
import type { LoadedSubject } from "@services/fileStore";

export interface CreatorState {
  dungeon: DungeonMetadata;
  rooms: Record<string, RoomMetadata>;
  guidance: CreatorTraversalSnapshot;
}

export type CreatorResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GraphDomainError };

export interface CreatorAddLinkedRoomsInput
  extends Omit<AddLinkedRoomsInput, "createdByPhase"> {}

export interface CreatorAddCrossLinkInput
  extends Omit<AddCrossLinkInput, "createdByPhase"> {}

export interface CreatorMutationSummary {
  touchedRoomIds: string[];
  revalidationImpactedRoomIds: string[];
  revalidationRevokedRoomIds: string[];
}

export interface CreatorStateMutationResult {
  state: CreatorState;
  summary: CreatorMutationSummary;
}

export interface CreatorSuggestionOutput {
  sourceRoomId: string;
  suggestions: TopicSuggestion[];
}

export interface CreatorInitializeInput {
  loadedSubject: LoadedSubject;
}
