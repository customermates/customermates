import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateSpec } from "./template-spec.schema";

export type TemplateIndexLocale = {
  name: string;
  summary: string;
  status: TemplateSpec["status"][string];
  publicPage: TemplateSpec["publicPage"][string];
  page: { metaTitle: string; metaDescription: string } | null;
};

export type TemplateIndexEntry = {
  slug: string;
  family: TemplateSpec["family"];
  kind: TemplateSpec["kind"];
  requiresCapabilities: Capability[];
  pairedPages: Record<string, string>;
  reviewedAt: string;
  counts: { lists: number; fields: number; views: number; widgets: number; rules: number };
  locales: Record<string, TemplateIndexLocale>;
};

export type TemplateIndex = readonly TemplateIndexEntry[];
