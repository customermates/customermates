import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { CHIP_COLORS } from "@/constants/chip-colors";

import { WikiPageKindSchema } from "./wiki.schema";

const UnitSchema = z.number().min(0).max(1);

export const WikiGraphRecordTypeSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  pluralLabel: z.string(),
  icon: z.string(),
  color: z.enum(CHIP_COLORS).optional(),
});
export type WikiGraphRecordType = Data<typeof WikiGraphRecordTypeSchema>;

export const WikiGraphNodeSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: WikiPageKindSchema,
  whenToUse: z.string().nullable(),
  updatedAt: z.date(),
  inbound: z.number().int().min(0),
  outbound: z.number().int().min(0),
  missing: z.number().int().min(0),
  records: z.number().int().min(0),
  x: UnitSchema,
  y: UnitSchema,
  pinned: z.boolean(),
});
export type WikiGraphNode = Data<typeof WikiGraphNodeSchema>;

export const WikiGraphLinkSchema = z.object({ source: z.uuid(), target: z.uuid() });
export type WikiGraphLink = Data<typeof WikiGraphLinkSchema>;

export const WikiGraphSchema = z.object({
  nodes: z.array(WikiGraphNodeSchema),
  links: z.array(WikiGraphLinkSchema),
  recordTypes: z.array(WikiGraphRecordTypeSchema),
  truncated: z.boolean(),
  syncing: z.boolean(),
});
export type WikiGraph = Data<typeof WikiGraphSchema>;

export const GetWikiGraphSchema = z.object({}).strict();
export type GetWikiGraphData = Data<typeof GetWikiGraphSchema>;

export const WikiLinkedPageSchema = z.object({ id: z.uuid(), title: z.string(), kind: WikiPageKindSchema });
export type WikiLinkedPage = Data<typeof WikiLinkedPageSchema>;

export const WikiPageRecordLinksSchema = WikiGraphRecordTypeSchema.extend({ count: z.number().int().min(1) });
export type WikiPageRecordLinks = Data<typeof WikiPageRecordLinksSchema>;

export const WikiPageLinksSchema = z.object({
  id: z.uuid(),
  linkedFrom: z.array(WikiLinkedPageSchema),
  linksTo: z.array(WikiLinkedPageSchema),
  missing: z.number().int().min(0),
  records: z.array(WikiPageRecordLinksSchema),
});
export type WikiPageLinks = Data<typeof WikiPageLinksSchema>;

export const GetWikiPageLinksSchema = z.object({ id: z.uuid() });
export type GetWikiPageLinksData = Data<typeof GetWikiPageLinksSchema>;

export const PinWikiGraphNodeSchema = z.union([
  z.object({ id: z.uuid(), x: UnitSchema, y: UnitSchema }).strict(),
  z.object({ id: z.uuid(), pinned: z.literal(false) }).strict(),
]);
export type PinWikiGraphNodeData = Data<typeof PinWikiGraphNodeSchema>;

export const PinWikiGraphNodeResultSchema = z.object({ id: z.uuid(), pinned: z.boolean() });
export type PinWikiGraphNodeResult = Data<typeof PinWikiGraphNodeResultSchema>;
