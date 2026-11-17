import type { ProposeWikiPageChangesData, WikiPageProposalDto } from "@/features/wiki/wiki-page-proposal.schema";

import { z } from "zod";

import { getGetWikiPageInteractor, getProposeWikiPageChangesInteractor } from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { manageWikiPagesTool } from "@/features/mcp-tools/wiki.mcp-tools";
import {
  customMcpFailure,
  formatDatesInResponse,
  mcpInteractorFailure,
  mcpMessageFailure,
  mcpValidationFailure,
  runInteractor,
  toonResult,
} from "@/features/mcp-tools/utils";
import { WIKI_PAGE_EDITS_MAX, WikiPageEditSchema, applyWikiPageEdits } from "@/features/wiki/wiki-page-edits";

import { isWikiProposalAction } from "./agent-wiki-proposal-policy";

type ManageWikiPagesInput = z.infer<typeof manageWikiPagesTool.inputSchema>;

const WIKI_PROPOSAL_RESULT_NOTE =
  "Nothing in the Knowledge Base changed yet. A manager reviews this proposal in the Knowledge Base and approves or rejects it. Tell the user it is proposed and awaiting review, not done.";

const ROUTINE_WIKI_DESCRIPTION_SUFFIX =
  " In a routine, create, update and delete only save a proposal that a manager reviews in the Knowledge Base; owner and verified cannot be proposed.";

const ROUTINE_WIKI_METADATA_ONLY =
  "In a routine, owner and verified cannot be proposed. Nothing was changed; propose a change to the title, text, kind or whenToUse instead.";

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

async function proposedUpdate(params: ManageWikiPagesInput) {
  if (params.action !== "update") return { params };
  const { edits, owner, verified, ...rest } = params;
  const hasContentChange = [rest.title, rest.markdown, edits, rest.kind, rest.whenToUse].some(
    (value) => value !== undefined,
  );
  if (!hasContentChange && (owner !== undefined || verified !== undefined))
    return { failure: mcpMessageFailure(ROUTINE_WIKI_METADATA_ONLY) };
  if (edits === undefined || !rest.id) return { params: rest };
  if (rest.markdown !== undefined)
    return { failure: await customMcpFailure(CustomErrorCode.wikiEditInvalid, undefined, ["edits"]) };
  const parsed = z.array(WikiPageEditSchema).min(1).max(WIKI_PAGE_EDITS_MAX).safeParse(edits);
  if (!parsed.success) return { failure: mcpValidationFailure(parsed.error) };
  const page = await getGetWikiPageInteractor().invoke({ id: rest.id });
  if (!page.ok) return { failure: mcpInteractorFailure(page.error) };
  if (!rest.expectedUpdatedAt || new Date(rest.expectedUpdatedAt).getTime() !== page.data.updatedAt.getTime()) {
    return {
      failure: await customMcpFailure(CustomErrorCode.wikiPageConflict, undefined, ["expectedUpdatedAt"]),
    };
  }
  const edited = applyWikiPageEdits(page.data.markdown, parsed.data);
  if (!edited.ok) return { failure: await customMcpFailure(edited.error, undefined, ["edits", edited.index]) };
  return { params: { ...rest, markdown: edited.markdown } };
}

export function routineManageWikiPagesTool(conversationId: string | undefined): typeof manageWikiPagesTool {
  return {
    ...manageWikiPagesTool,
    description: `${manageWikiPagesTool.description}${ROUTINE_WIKI_DESCRIPTION_SUFFIX}`,
    execute: async (params: ManageWikiPagesInput) => {
      if (!isWikiProposalAction(params.action)) return manageWikiPagesTool.execute(params);
      if (!conversationId)
        return mcpMessageFailure("This routine has no conversation to attach the proposal to. Nothing was changed.");
      const proposed = await proposedUpdate(params);
      if (proposed.failure) return proposed.failure;
      return runInteractor(
        getProposeWikiPageChangesInteractor().invoke({
          ...proposed.params,
          conversationId,
        } as unknown as ProposeWikiPageChangesData),
        proposalResult,
      );
    },
  };
}
