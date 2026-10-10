import type { Filter } from "@/core/base/base-get.schema";
import type { DataViewProposal } from "./data-view-proposal.schema";
import type { DataViewState } from "./data-view-state.schema";

import { ALL_VIEW_KEY } from "./data-view-keys";

export type ViewProposalDraft = { state: DataViewState; name?: string; isNew: boolean };

export type ViewDraft = { filters?: Filter[]; searchTerm: string | undefined; proposal?: ViewProposalDraft };

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

export function proposalDraft(proposal: DataViewProposal): ViewDraft {
  return {
    ...(proposal.state.filters ? { filters: proposal.state.filters } : {}),
    searchTerm: proposal.state.searchTerm || undefined,
    proposal: { state: proposal.state, ...(proposal.name ? { name: proposal.name } : {}), isNew: !proposal.viewKey },
  };
}

export function rememberViewProposal(
  user: { id: string; companyId: string } | null | undefined,
  proposal: DataViewProposal,
): void {
  const owner = viewQueryDraftOwner(user);
  if (!owner || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      draftStorageKey(owner, proposal.surfaceKey, proposal.viewKey ?? ALL_VIEW_KEY),
      JSON.stringify(proposalDraft(proposal)),
    );
  } catch {
    return;
  }
}
