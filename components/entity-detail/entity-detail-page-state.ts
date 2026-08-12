import type { EntityLoadState } from "@/core/base/base-custom-column-entity-modal.store";

type EntityDetailPageState = "loading" | "not-found" | "error" | "content";
type EntityDrawerPageState = "closed" | EntityDetailPageState;

type Input = {
  hasCurrentEntity: boolean;
  requestMatches: boolean;
  requestState: EntityLoadState;
};

export function resolveEntityDetailPageState({
  hasCurrentEntity,
  requestMatches,
  requestState,
}: Input): EntityDetailPageState {
  if (hasCurrentEntity) return "content";
  if (requestMatches && requestState === "not-found") return "not-found";
  if (requestMatches && requestState === "error") return "error";
  return "loading";
}

export function resolveEntityDrawerPageState({
  hasActiveEntity,
  isPrepared,
  isNew,
  requestState,
}: {
  hasActiveEntity: boolean;
  isPrepared: boolean;
  isNew: boolean;
  requestState: EntityLoadState;
}): EntityDrawerPageState {
  if (!hasActiveEntity) return "closed";
  if (!isPrepared || requestState === "loading") return "loading";
  if (!isNew && requestState === "not-found") return "not-found";
  if (requestState === "error") return "error";
  return "content";
}
