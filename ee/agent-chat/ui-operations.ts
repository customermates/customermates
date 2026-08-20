import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { TOOLBAR_PAGES_WITH_ADD, TOOLBAR_PAGES_WITHOUT_ADD } from "./ui-anchors";

const TOOLBAR_PAGES = [...TOOLBAR_PAGES_WITH_ADD, ...TOOLBAR_PAGES_WITHOUT_ADD];

export const AGENT_VIEW_IDS = TOOLBAR_PAGES.map((page) => page.scope) as [string, ...string[]];

export const AGENT_VIEW_ROUTES: Record<string, string> = Object.fromEntries(
  TOOLBAR_PAGES.map((page) => [page.scope, page.route]),
);

export const ConfigureViewSchema = z.object({
  view: z.enum(AGENT_VIEW_IDS),
  layout: z.enum(["table", "cards", "kanban"]).optional(),
  groupBy: z.string().trim().min(1).max(100).optional(),
  sortBy: z.string().trim().min(1).max(100).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  search: z.string().max(200).optional(),
  filters: z
    .array(
      z.object({
        field: z.string().min(1).max(100),
        operator: z.enum([
          "equals",
          "contains",
          "gt",
          "gte",
          "lt",
          "lte",
          "in",
          "notIn",
          "between",
          "isNull",
          "isNotNull",
          "inLastDays",
        ]),
        value: z.string().max(200).optional(),
        values: z.array(z.string().max(200)).max(10).optional(),
      }),
    )
    .max(5)
    .optional(),
  clearFilters: z.boolean().optional(),
});

export type ConfigureViewData = Data<typeof ConfigureViewSchema>;

export const AGENT_OPEN_RECORD_ENTITIES = ["contact", "organization", "deal", "service", "task"] as const;

export const OpenRecordSchema = z.object({
  entity: z.enum(AGENT_OPEN_RECORD_ENTITIES),
  recordId: z.union([z.uuid(), z.literal("new")]),
  presentation: z.enum(["page", "drawer"]).optional(),
});

export type OpenRecordData = Data<typeof OpenRecordSchema>;
