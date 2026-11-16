import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";

import { CreateWikiPagesSchema } from "./create-wiki-pages.interactor";
import { DeleteWikiPageResultSchema, DeleteWikiPageSchema } from "./delete-wiki-page.interactor";
import { GetWikiPageSchema } from "./get-wiki-page.interactor";
import { MoveWikiPageSchema } from "./move-wiki-page.interactor";
import { UpdateWikiPageSchema } from "./update-wiki-page.interactor";
import { GetWikiGraphSchema, GetWikiPageLinksSchema, WikiGraphSchema, WikiPageLinksSchema } from "./wiki-graph.schema";
import {
  WikiPageDtoSchema,
  WikiPageListResultSchema,
  WikiPageListSchema,
  WikiPageSearchResultSchema,
  WikiPageSearchSchema,
} from "./wiki.schema";

const EXAMPLE_PAGE_ID = "00000000-0000-4000-8000-000000000001";
const EXAMPLE_TARGET_ID = "00000000-0000-4000-8000-000000000002";
const EXAMPLE_UPDATED_AT = "2026-10-01T09:30:00.000Z";

const READ = "Requires: Knowledge Base read access.";
const CREATE = "Requires: Knowledge Base Create.";
const EDIT = "Requires: Knowledge Base Edit.";
const DELETE = "Requires: Knowledge Base Delete.";

function wikiOperation(
  operationId: string,
  summary: string,
  description: string,
  input: z.ZodType,
  example: Record<string, unknown>,
  output: z.ZodType,
  success: string,
): ZodOpenApiOperationObject {
  return {
    operationId,
    summary,
    description,
    tags: ["knowledge-base"],
    security: [{ apiKeyAuth: [] }],
    requestBody: {
      required: true,
      content: { "application/json": { schema: input, examples: { default: { value: example } } } },
    },
    responses: {
      "200": { description: success, content: { "application/json": { schema: output } } },
      ...StructuredApiResponses,
    },
  };
}

export const wikiApiPaths = {
  "/v1/wiki/list": {
    post: wikiOperation(
      "listWikiPages",
      "List Knowledge Base pages",
      `Lists Knowledge Base pages without their Markdown: the Operating Guide first, then the other pages in the workspace's saved order. Filter by kind (guide, procedure or knowledge). ${READ}`,
      WikiPageListSchema,
      { page: 1, pageSize: 25, kind: "procedure" },
      WikiPageListResultSchema,
      "One page of Knowledge Base page summaries.",
    ),
  },
  "/v1/wiki/search": {
    post: wikiOperation(
      "searchWikiPages",
      "Search Knowledge Base pages",
      `Searches titles, headings and text, ranked by relevance. Each hit carries a snippet, its section and the character offset of that section. total is a lower bound unless totalIsExact; continue with the next page while hasMore. didYouMean reports a corrected spelling. Later pages reuse the first page's order for five minutes. ${READ}`,
      WikiPageSearchSchema,
      { query: "support escalation", page: 1, pageSize: 10 },
      WikiPageSearchResultSchema,
      "One page of ranked search hits.",
    ),
  },
  "/v1/wiki/read": {
    post: wikiOperation(
      "readWikiPage",
      "Read a Knowledge Base page",
      `Reads one page with its full Markdown. Keep updatedAt: update and delete require it as expectedUpdatedAt. Link pages as \`/wiki?page=<id>\`; ids survive renames. A missing page answers 404. ${READ}`,
      GetWikiPageSchema,
      { id: EXAMPLE_PAGE_ID },
      WikiPageDtoSchema,
      "The page.",
    ),
  },
  "/v1/wiki/graph": {
    post: wikiOperation(
      "getWikiGraph",
      "Read the Knowledge Base map",
      `Returns every live page as a node with its saved map position, the links between pages, and how many pages link to each page. Positions are kept per workspace, so the map stays stable between reads; a pinned node keeps the place a person gave it. Links to records count per page and recordTypes names the lists the caller may read. Send an empty object. ${READ}`,
      GetWikiGraphSchema,
      {},
      WikiGraphSchema,
      "The nodes, links and record lists of the map.",
    ),
  },
  "/v1/wiki/links": {
    post: wikiOperation(
      "getWikiPageLinks",
      "Read the links of a Knowledge Base page",
      `Lists the pages that link to one page, the pages it links to, how many of its page links point at a deleted page, and the record lists it links into with a count per list. A missing page answers 404. ${READ}`,
      GetWikiPageLinksSchema,
      { id: EXAMPLE_PAGE_ID },
      WikiPageLinksSchema,
      "The links of the page.",
    ),
  },
  "/v1/wiki/create": {
    post: wikiOperation(
      "createWikiPages",
      "Create Knowledge Base pages",
      `Creates one to five pages atomically and appends them to the saved order. kind defaults to knowledge; a procedure needs whenToUse and numbered steps; the workspace has at most one guide. With requireEmpty, the call fails with 409 unless the Knowledge Base is empty. ${CREATE}`,
      CreateWikiPagesSchema,
      {
        pages: [
          {
            title: "Support escalation",
            kind: "procedure",
            whenToUse: "A customer reports an outage or a billing error.",
            markdown: "1. Confirm the account.\n2. Hand over to the support lead.",
          },
        ],
      },
      z.array(WikiPageDtoSchema),
      "The created pages.",
    ),
  },
  "/v1/wiki/update": {
    post: wikiOperation(
      "updateWikiPage",
      "Update a Knowledge Base page",
      `Changes the title, Markdown, kind or whenToUse of one page; omitted fields keep their values. Send updatedAt from your latest read as expectedUpdatedAt: a page changed since answers 409, so read it again and retry. ${EDIT}`,
      UpdateWikiPageSchema,
      { id: EXAMPLE_PAGE_ID, expectedUpdatedAt: EXAMPLE_UPDATED_AT, title: "Support handoff" },
      WikiPageDtoSchema,
      "The updated page.",
    ),
  },
  "/v1/wiki/move": {
    post: wikiOperation(
      "moveWikiPage",
      "Move a Knowledge Base page",
      `Places a page before or after another page in the order the whole workspace shares. Content and edit timestamps are unchanged. The Operating Guide stays pinned first: it can be neither moved nor used as the target. ${EDIT}`,
      MoveWikiPageSchema,
      { id: EXAMPLE_PAGE_ID, targetId: EXAMPLE_TARGET_ID, placement: "after" },
      z.literal(true),
      "The page was moved.",
    ),
  },
  "/v1/wiki/delete": {
    post: wikiOperation(
      "deleteWikiPage",
      "Delete a Knowledge Base page",
      `Moves one page to Trash, where it is deleted permanently after 30 days unless POST /v1/trash/restore restores it with the returned trashBatchId. Send updatedAt from your latest read as expectedUpdatedAt. ${DELETE}`,
      DeleteWikiPageSchema,
      { id: EXAMPLE_PAGE_ID, expectedUpdatedAt: EXAMPLE_UPDATED_AT },
      DeleteWikiPageResultSchema,
      "The deleted page and its Trash batch.",
    ),
  },
} satisfies Record<string, { post: ZodOpenApiOperationObject }>;
