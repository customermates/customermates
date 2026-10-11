import type { Filter } from "@/core/base/base-get.schema";
import type { DataViewProposal } from "./data-view-proposal.schema";
import type { DataViewState } from "./data-view-state.schema";

import { ALL_VIEW_KEY } from "./data-view-keys";
import { DataViewStateSchema } from "./data-view-state.schema";

export type ViewProposalDraft = { state: DataViewState; name?: string; isNew: boolean };

export type ViewDraft = {
  filters?: Filter[];
  searchTerm: string | undefined;
  proposal?: ViewProposalDraft;
  appearance?: DataViewState;
  savedAppearance?: DataViewState;
};

const VIEW_QUERY_DRAFT_PREFIX = "customermates:view-query-draft:";

export function viewQueryDraftOwner(user: { id: string; companyId: string } | null | undefined): string | undefined {
  return user ? `${user.companyId}:${user.id}` : undefined;
}

export function forgetOtherViewQueryDrafts(owner: string | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const ownPrefix = owner ? `${VIEW_QUERY_DRAFT_PREFIX}${owner}:` : undefined;
    const stale = Object.keys(window.sessionStorage).filter(
      (key) => key.startsWith(VIEW_QUERY_DRAFT_PREFIX) && (!ownPrefix || !key.startsWith(ownPrefix)),
    );
    for (const key of stale) window.sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

export function draftStorageKey(owner: string, surfaceKey: string, viewKey: string) {
  return `${VIEW_QUERY_DRAFT_PREFIX}${owner}:${surfaceKey}:${viewKey}`;
}

export function parseViewDraft(raw: string | null): ViewDraft | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<ViewDraft>;
    const state = DataViewStateSchema.safeParse(parsed.proposal?.state);
    const appearance = DataViewStateSchema.safeParse(parsed.appearance);
    const savedAppearance = DataViewStateSchema.safeParse(parsed.savedAppearance);
    return {
      ...(Array.isArray(parsed.filters) ? { filters: parsed.filters } : {}),
      searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : undefined,
      ...(appearance.success && savedAppearance.success && parsed.appearance && parsed.savedAppearance
        ? { appearance: appearance.data, savedAppearance: savedAppearance.data }
        : {}),
      ...(state.success
        ? {
            proposal: {
              state: state.data,
              ...(typeof parsed.proposal?.name === "string" ? { name: parsed.proposal.name } : {}),
              isNew: parsed.proposal?.isNew === true,
            },
          }
        : {}),
    };
  } catch {
    return undefined;
  }
}

export function proposalViewKey(proposal: DataViewProposal): string {
  return proposal.viewKey ?? ALL_VIEW_KEY;
}

export function mergeProposalDraft(existing: ViewDraft | undefined, proposal: DataViewProposal): ViewDraft {
  const proposed: DataViewState = { ...proposal.state };
  delete proposed.searchTerm;
  const state: DataViewState = {
    ...existing?.proposal?.state,
    ...(existing?.filters ? { filters: existing.filters } : {}),
    ...proposed,
  };
  const name = proposal.name ?? existing?.proposal?.name;
  return {
    ...(state.filters ? { filters: state.filters } : {}),
    searchTerm: existing?.searchTerm,
    proposal: {
      state,
      ...(name ? { name } : {}),
      isNew: !proposal.viewKey || existing?.proposal?.isNew === true,
    },
  };
}

export function rememberViewProposal(
  user: { id: string; companyId: string } | null | undefined,
  proposal: DataViewProposal,
): void {
  const owner = viewQueryDraftOwner(user);
  if (!owner || typeof window === "undefined") return;
  try {
    const key = draftStorageKey(owner, proposal.surfaceKey, proposalViewKey(proposal));
    window.sessionStorage.setItem(
      key,
      JSON.stringify(mergeProposalDraft(parseViewDraft(window.sessionStorage.getItem(key)), proposal)),
    );
  } catch {
    return;
  }
}
