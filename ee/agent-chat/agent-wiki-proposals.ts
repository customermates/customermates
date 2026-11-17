import type { z } from "zod";
import type { ProposeWikiPageChangesData, WikiPageProposalDto } from "@/features/wiki/wiki-page-proposal.schema";

import { getProposeWikiPageChangesInteractor } from "@/core/di";
import { manageWikiPagesTool } from "@/features/mcp-tools/wiki.mcp-tools";
import { formatDatesInResponse, mcpMessageFailure, runInteractor, toonResult } from "@/features/mcp-tools/utils";

import { isWikiProposalAction } from "./agent-wiki-proposal-policy";

type ManageWikiPagesInput = z.infer<typeof manageWikiPagesTool.inputSchema>;

const WIKI_PROPOSAL_RESULT_NOTE =
  "Nothing in the Knowledge Base changed yet. A manager reviews this proposal in the Knowledge Base and approves or rejects it. Tell the user it is proposed and awaiting review, not done.";

const ROUTINE_WIKI_DESCRIPTION_SUFFIX =
  " In a routine, create, update and delete only save a proposal that a manager reviews in the Knowledge Base.";

const UNREVIEWED_WIKI_DESCRIPTION_SUFFIX =
  " In this run create, update and delete are not available, because nobody can review a proposal here: say in your report what should change in the Knowledge Base instead.";

const UNREVIEWED_WIKI_REFUSAL =
  "Knowledge Base pages cannot be created, updated or deleted in this run, because nobody can review a proposal here. Nothing was changed. Say in your report what should change.";

function proposalResult(proposals: WikiPageProposalDto[]) {
  return toonResult({
    status: "pending_review",
    proposals: formatDatesInResponse(
      proposals.map((proposal) => ({
        proposalId: proposal.id,
        action: proposal.action,
        ...(proposal.pageId ? { pageId: proposal.pageId } : {}),
        ...(proposal.title ? { title: proposal.title } : {}),
      })),
    ),
    note: WIKI_PROPOSAL_RESULT_NOTE,
  });
}

export function routineManageWikiPagesTool(conversationId: string | undefined): typeof manageWikiPagesTool {
  return {
    ...manageWikiPagesTool,
    description: `${manageWikiPagesTool.description}${conversationId ? ROUTINE_WIKI_DESCRIPTION_SUFFIX : UNREVIEWED_WIKI_DESCRIPTION_SUFFIX}`,
    execute: async (params: ManageWikiPagesInput) => {
      if (!isWikiProposalAction(params.action)) return manageWikiPagesTool.execute(params);
      if (!conversationId) return mcpMessageFailure(UNREVIEWED_WIKI_REFUSAL);
      return runInteractor(
        getProposeWikiPageChangesInteractor().invoke({
          ...params,
          conversationId,
        } as unknown as ProposeWikiPageChangesData),
        proposalResult,
      );
    },
  };
}
