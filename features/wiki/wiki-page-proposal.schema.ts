import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

import {
  WikiMarkdownSchema,
  WikiPageDtoSchema,
  WikiPageInputSchema,
  WikiPageKindSchema,
  WikiTitleSchema,
  WikiWhenToUseSchema,
} from "./wiki.schema";

export const WIKI_PAGE_PROPOSAL_ACTIONS = ["create", "update", "delete"] as const;
export const WikiPageProposalActionSchema = z.enum(WIKI_PAGE_PROPOSAL_ACTIONS);
export type WikiPageProposalAction = Data<typeof WikiPageProposalActionSchema>;

export const WIKI_PAGE_PROPOSAL_STATUSES = ["pending", "approved", "rejected", "superseded"] as const;
export const WikiPageProposalStatusSchema = z.enum(WIKI_PAGE_PROPOSAL_STATUSES);
export type WikiPageProposalStatus = Data<typeof WikiPageProposalStatusSchema>;

export const WIKI_PAGE_PROPOSAL_REVIEW_LIMIT = 50;

export const WikiPageProposalDtoSchema = z.object({
  id: z.uuid(),
  action: WikiPageProposalActionSchema,
  status: WikiPageProposalStatusSchema,
  pageId: z.uuid().nullable(),
  title: z.string().nullable(),
  markdown: z.string().nullable(),
  kind: WikiPageKindSchema.nullable(),
  whenToUse: z.string().nullable(),
  baseUpdatedAt: z.date().nullable(),
  routineId: z.uuid().nullable(),
  routineName: z.string().nullable(),
  routineRunId: z.uuid().nullable(),
  conversationId: z.uuid().nullable(),
  reviewedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type WikiPageProposalDto = Data<typeof WikiPageProposalDtoSchema>;

export const WikiPageProposalReviewItemSchema = WikiPageProposalDtoSchema.extend({
  currentPage: WikiPageDtoSchema.nullable(),
  stale: z.boolean(),
});
export type WikiPageProposalReviewItem = Data<typeof WikiPageProposalReviewItemSchema>;

export const WikiPageProposalReviewListSchema = z.object({
  items: z.array(WikiPageProposalReviewItemSchema).max(WIKI_PAGE_PROPOSAL_REVIEW_LIMIT),
  total: z.number().int().min(0),
});
export type WikiPageProposalReviewList = Data<typeof WikiPageProposalReviewListSchema>;

const ProposalOriginSchema = z.object({ conversationId: z.uuid() });

const CreateProposalSchema = ProposalOriginSchema.extend({
  action: z.literal("create"),
  pages: z.array(WikiPageInputSchema).min(1).max(5),
});

const UpdateProposalSchema = ProposalOriginSchema.extend({
  action: z.literal("update"),
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
  title: WikiTitleSchema.optional(),
  markdown: WikiMarkdownSchema.optional(),
  kind: WikiPageKindSchema.optional(),
  whenToUse: WikiWhenToUseSchema.optional(),
});

const DeleteProposalSchema = ProposalOriginSchema.extend({
  action: z.literal("delete"),
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
});

export const ProposeWikiPageChangesSchema = z
  .discriminatedUnion("action", [CreateProposalSchema, UpdateProposalSchema, DeleteProposalSchema])
  .superRefine((data, ctx) => {
    if (
      data.action === "update" &&
      [data.title, data.markdown, data.kind, data.whenToUse].every((value) => value === undefined)
    )
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.wikiPageUpdateEmpty } });
  });
export type ProposeWikiPageChangesData = Data<typeof ProposeWikiPageChangesSchema>;

export const WikiPageProposalIdSchema = z.object({ id: z.uuid() });
export type WikiPageProposalIdData = Data<typeof WikiPageProposalIdSchema>;
