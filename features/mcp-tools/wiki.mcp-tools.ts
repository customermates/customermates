import { z } from "zod";

import {
  getCreateWikiPagesInteractor,
  getDeleteWikiPageInteractor,
  getGetWikiPageInteractor,
  getGetWikiPagesInteractor,
  getSearchWikiPagesInteractor,
  getUpdateWikiPageInteractor,
} from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { wikiCodePointBoundary, wikiMarkdownChunk } from "@/features/wiki/wiki-page-chunk";
import {
  extractWikiPageLinks,
  wikiMarkdownHasHeadings,
  wikiMarkdownHasLinksOrImages,
  wikiMarkdownPlainText,
} from "@/features/wiki/wiki-markdown-links";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import { WikiMarkdownSchema, WIKI_TITLE_MAX_LENGTH } from "@/features/wiki/wiki.schema";
import { env } from "@/env";
import { WIKI_HOMEPAGE_TOPICS } from "@/features/wiki/wiki-homepage";
import { getTranslator } from "@/i18n/get-translator";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/i18n/locale-registry";

import {
  customMcpFailure,
  formatDatesInResponse,
  mcpInteractorFailure,
  mcpPage,
  mcpValidationFailure,
  runInteractor,
  toonResult,
  encodeToToon,
} from "./utils";

const WIKI_MCP_TEXT_TARGET_LENGTH = 5_500;
const WikiMcpPageSizeSchema = z.literal(5).default(5).describe("Results per page (fixed at 5)");

const PagingSchema = z.object({
  page: mcpPage(),
  pageSize: WikiMcpPageSizeSchema,
});

const ListSchema = PagingSchema;
const SearchSchema = PagingSchema.extend({
  query: z.string().trim().min(1).max(200),
});
const GetSchema = z.object({
  id: z.uuid(),
  offset: z.coerce.number().int().min(0).default(0),
});
const PublicSourceUrlSchema = z
  .url()
  .max(2_000)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Source URL must use HTTP(S).");
const PageInputSchema = z.object({
  title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH),
  markdown: z.string(),
});
const WikiHomepageTopicSchema = z.enum(WIKI_HOMEPAGE_TOPICS);
const WIKI_HOMEPAGE_RESERVED_HEADINGS = new Set(
  [
    "Sources",
    "Gaps to confirm",
    "Related pages",
    "Quellen",
    "Noch zu klären",
    "Verwandte Seiten",
    "Fuentes",
    "Aspectos por confirmar",
    "Páginas relacionadas",
    "Points à confirmer",
    "Pages associées",
    "Fonti",
    "Aspetti da confermare",
    "Pagine correlate",
  ].map((heading) => heading.toLocaleLowerCase()),
);
function normalizeWikiHomepageText(value: string) {
  return value.replace(/[ \t]*—[ \t]*/gu, " - ").trim();
}

function normalizeWikiHomepageHeading(value: string) {
  const canonical = WikiMarkdownSchema.safeParse(value);
  return normalizeWikiHomepageText(wikiMarkdownPlainText(canonical.success ? canonical.data : value)).replace(
    /[ \t]+#{1,6}[ \t]*$/u,
    "",
  );
}

function normalizeWikiHomepageContent(value: string) {
  const canonical = WikiMarkdownSchema.safeParse(value);
  const normalized = normalizeWikiHomepageText(canonical.success ? canonical.data : value)
    .replace(/^#{1,6}[ \t]+/gmu, "")
    .trim();
  const reparsed = WikiMarkdownSchema.safeParse(normalized);
  return reparsed.success ? reparsed.data.trim() : "";
}

const WikiHomepageSectionHeadingSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\r\n]/u.test(value), "A section heading must be one line.")
  .refine((value) => !wikiMarkdownHasLinksOrImages(value), "A section heading cannot contain links or images.")
  .transform(normalizeWikiHomepageHeading)
  .pipe(
    z
      .string()
      .min(1, "A section heading cannot contain only Markdown markers.")
      .max(120)
      .refine((value) => !/[\r\n]/u.test(value), "A section heading must be one line.")
      .refine(
        (value) => !WIKI_HOMEPAGE_RESERVED_HEADINGS.has(value.toLocaleLowerCase()),
        "Sources, gaps, and related-page headings are added by the server.",
      ),
  );
const WikiHomepageSectionContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_000)
  .transform(normalizeWikiHomepageContent)
  .pipe(
    z
      .string()
      .min(1)
      .max(8_000)
      .refine((value) => !wikiMarkdownHasHeadings(value), "Section content cannot contain headings.")
      .refine(
        (value) => !wikiMarkdownHasLinksOrImages(value),
        "Section content cannot contain links or images; source links are added by the server.",
      ),
  );
const WikiHomepageSectionSchema = z.object({
  heading: WikiHomepageSectionHeadingSchema.describe(
    "Short descriptive heading in the requested language. Do not include Markdown # markers.",
  ),
  content: WikiHomepageSectionContentSchema.describe(
    "Concise evidence-backed Markdown paragraphs or lists for this section. Do not include any headings, Sources, gaps, related pages, or em dashes.",
  ),
});
const WikiHomepageSetupPageSchema = z
  .object({
    topic: WikiHomepageTopicSchema.describe(
      "The single starter-page topic. company_overview covers identity, mission, public proof, and trust. products_services covers durable offerings, value, capabilities, use cases, and integrations without plan names, pricing, limits, or plan gating. customers_competitors uses only explicit company audience evidence; competitor copy cannot establish this company's customers. voice_tone records observable wording and examples as unapproved observations. support_faq covers public onboarding, support, documentation, security, policies, and useful gaps in internal process without commercial offer terms.",
    ),
    sections: z
      .array(WikiHomepageSectionSchema)
      .max(5)
      .describe(
        "Zero to five complementary sections containing only durable facts directly supported by successfully read pages. One strong section is better than several weak ones. Use zero when the sources do not support this topic with durable facts. Omit trials and offers, plan names, pricing, limits, plan gating, inferred audiences, and unsupported approval behavior. The server renders the H2 headings and adds localized review questions.",
      ),
    sources: z
      .array(PublicSourceUrlSchema)
      .max(4)
      .describe("Exact successful read_public_page result URLs used as evidence for this page's sections."),
  })
  .superRefine((page, ctx) => {
    if (page.sections.length > 0 !== page.sources.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Sections and sources must either both contain evidence or both be empty.",
        path: page.sections.length > 0 ? ["sources"] : ["sections"],
      });
    }
  });
export const WikiHomepageSetupCreateSchema = z
  .object({
    action: z.literal("create"),
    pages: z.array(WikiHomepageSetupPageSchema).length(WIKI_HOMEPAGE_TOPICS.length),
    requireEmpty: z.literal(true),
  })
  .superRefine((data, ctx) => {
    const topics = new Set(data.pages.map(({ topic }) => topic));
    for (const topic of WIKI_HOMEPAGE_TOPICS) {
      if (!topics.has(topic)) {
        ctx.addIssue({
          code: "custom",
          message: `Missing required topic: ${topic}`,
          path: ["pages"],
        });
      }
    }
    if (!data.pages.some(({ sections }) => sections.length > 0)) {
      ctx.addIssue({
        code: "custom",
        message: "At least one page must contain sourced website information.",
        path: ["pages"],
      });
    }
  });
const CreateSchema = z.object({
  pages: z.array(PageInputSchema).min(1).max(5),
  requireEmpty: z.boolean().default(false),
});
const UpdateSchema = z
  .object({
    id: z.uuid(),
    expectedUpdatedAt: z.iso.datetime(),
    title: z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH).optional(),
    markdown: z.string().optional(),
  })
  .refine((data) => data.title !== undefined || data.markdown !== undefined, {
    message: "At least one of title or markdown is required.",
  });
const DeleteSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
});

const ManageWikiPagesSchema = z.object({
  action: z.enum(["list", "search", "get", "create", "update", "delete"]),
  id: z.uuid().optional(),
  query: z.string().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  page: mcpPage(),
  pageSize: WikiMcpPageSizeSchema,
  pages: z.array(PageInputSchema).min(1).max(5).optional(),
  requireEmpty: z.boolean().optional(),
  expectedUpdatedAt: z.iso.datetime().optional(),
  title: z.string().optional(),
  markdown: z.string().optional(),
});

const ManageWikiPagesOutputSchema = z.looseObject({
  items: z.array(z.looseObject({ id: z.string(), title: z.string() })).optional(),
  total: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  id: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  markdown: z.string().optional(),
  markdownChunk: z.string().optional(),
  offset: z.number().optional(),
  nextOffset: z.number().nullable().optional(),
  totalChars: z.number().optional(),
  links: z
    .array(
      z.looseObject({
        id: z.string(),
        label: z.string(),
        url: z.string(),
        fetchId: z.string(),
      }),
    )
    .optional(),
  linksTruncated: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

function pageSummary(page: { id: string; title: string; markdown: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: page.id,
    title: page.title,
    url: wikiPageUrl(env.BASE_URL, page.id),
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

function wikiPageChunk(
  page: {
    id: string;
    title: string;
    markdown: string;
    createdAt: Date;
    updatedAt: Date;
  },
  requestedOffset: number,
) {
  const discoveredLinks = extractWikiPageLinks(page.markdown, env.BASE_URL, 6);
  const offset = wikiMarkdownChunk(page.markdown, requestedOffset, 0, env.BASE_URL).offset;
  const base = formatDatesInResponse({
    id: page.id,
    title: page.title,
    url: wikiPageUrl(env.BASE_URL, page.id),
    offset,
    nextOffset: null as number | null,
    totalChars: page.markdown.length,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    links: discoveredLinks.slice(0, 5),
    linksTruncated: discoveredLinks.length > 5,
  });
  const payload = (end: number) => ({
    ...base,
    nextOffset: end < page.markdown.length ? end : null,
    markdownChunk: page.markdown.slice(offset, end),
  });

  let low = offset;
  let high = page.markdown.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (encodeToToon(payload(middle)).length <= WIKI_MCP_TEXT_TARGET_LENGTH) low = middle;
    else high = middle - 1;
  }

  const safe = wikiMarkdownChunk(page.markdown, offset, Math.max(0, low - offset), env.BASE_URL);
  const safePayload = payload(safe.nextOffset ?? safe.totalChars);
  return encodeToToon(safePayload).length <= WIKI_MCP_TEXT_TARGET_LENGTH
    ? safePayload
    : payload(wikiCodePointBoundary(page.markdown, low));
}

export const manageWikiPagesTool = {
  name: "manage_wiki_pages",
  title: "Manage Workspace Wiki pages",
  description:
    "Read and manage the shared Workspace Wiki. " +
    "Read company facts, processes, voice, and support guidance before answering or acting on them. " +
    "list returns pages in creation order. search ranks query terms in titles and Markdown and returns short snippets. " +
    "get returns one Markdown chunk; pass nextOffset back as offset until it is null. " +
    "create atomically creates one to five pages; requireEmpty=true refuses the whole batch unless the Wiki is empty. " +
    "update changes title and/or Markdown and requires expectedUpdatedAt from a prior read. " +
    "delete permanently deletes one page and requires expectedUpdatedAt; deletion is irreversible. " +
    "Link pages with ordinary Markdown links to /wiki?page=<page-id>; page ids remain stable when titles change.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageWikiPagesSchema,
  outputSchema: ManageWikiPagesOutputSchema,
  execute: async (params: z.infer<typeof ManageWikiPagesSchema>) => {
    if (params.action === "list") {
      const parsed = ListSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getGetWikiPagesInteractor().invoke(parsed.data), (data) =>
        toonResult(formatDatesInResponse(data)),
      );
    }

    if (params.action === "search") {
      const parsed = SearchSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getSearchWikiPagesInteractor().invoke(parsed.data), (data) =>
        toonResult(formatDatesInResponse(data)),
      );
    }

    if (params.action === "get") {
      const parsed = GetSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const outcome = await getGetWikiPageInteractor().invoke({
        id: parsed.data.id,
      });
      if (!outcome.ok) return mcpInteractorFailure(outcome.error);
      if (!outcome.data) return customMcpFailure(CustomErrorCode.wikiPageNotFound, undefined, ["id"]);

      return toonResult(wikiPageChunk(outcome.data, parsed.data.offset));
    }

    if (params.action === "create") {
      const parsed = CreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getCreateWikiPagesInteractor().invoke(parsed.data), (pages) =>
        toonResult({ items: formatDatesInResponse(pages.map(pageSummary)) }),
      );
    }

    if (params.action === "update") {
      const parsed = UpdateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getUpdateWikiPageInteractor().invoke({
          ...parsed.data,
          expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
        }),
        (page) => toonResult(formatDatesInResponse(pageSummary(page))),
      );
    }

    const parsed = DeleteSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(
      getDeleteWikiPageInteractor().invoke({
        ...parsed.data,
        expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
      }),
      (page) => toonResult({ deleted: true, id: page.id }),
    );
  },
};

async function setupPages(input: z.infer<typeof WikiHomepageSetupCreateSchema>, locale: AppLocale) {
  const t = await getTranslator(locale, "WikiSetup.generated");
  const pagesByTopic = new Map(input.pages.map((page) => [page.topic, page]));
  const titles = {
    company_overview: t("topics.company_overview"),
    products_services: t("topics.products_services"),
    customers_competitors: t("topics.customers_competitors"),
    voice_tone: t("topics.voice_tone"),
    support_faq: t("topics.support_faq"),
  } satisfies Record<(typeof WIKI_HOMEPAGE_TOPICS)[number], string>;
  const defaultGaps = {
    company_overview: t("defaultGaps.company_overview"),
    products_services: t("defaultGaps.products_services"),
    customers_competitors: t("defaultGaps.customers_competitors"),
    voice_tone: t("defaultGaps.voice_tone"),
    support_faq: t("defaultGaps.support_faq"),
  } satisfies Record<(typeof WIKI_HOMEPAGE_TOPICS)[number], string>;
  return WIKI_HOMEPAGE_TOPICS.map((topic) => {
    const page = pagesByTopic.get(topic);
    if (!page) throw new Error(`The homepage setup payload is missing ${topic}.`);
    const body = page.sections.map(({ heading, content }) => `## ${heading}\n\n${content}`).join("\n\n");
    const sourcedContent = body
      ? `${body}\n\n## ${t("sourcesHeading")}\n\n` +
        `${[...new Set(page.sources)].map((source) => `- <${source}>`).join("\n")}`
      : "";
    return {
      setupTopic: topic,
      setupRelatedHeading: t("relatedPages"),
      title: titles[topic],
      markdown: [sourcedContent, `## ${t("gapsHeading")}\n\n- ${defaultGaps[topic]}`].filter(Boolean).join("\n\n"),
    };
  });
}

export function wikiHomepageSetupTool(locale: string | undefined) {
  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    ...manageWikiPagesTool,
    description:
      "Create five broad starter Wiki pages in one atomic empty-Wiki-only call. Supply each topic exactly once. Evidence-backed pages use zero to five structured sections and one to four exact successfully read source URLs; unsupported topics use empty sections and sources. Localized titles, H2 headings, Sources, tailored review questions, and stable internal links are added by the server.",
    inputSchema: WikiHomepageSetupCreateSchema,
    execute: async (params: z.infer<typeof WikiHomepageSetupCreateSchema>) => {
      const parsed = WikiHomepageSetupCreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getCreateWikiPagesInteractor().invoke({
          requireEmpty: true,
          pages: await setupPages(parsed.data, appLocale),
        }),
        (pages) => toonResult({ items: formatDatesInResponse(pages.map(pageSummary)) }),
      );
    },
  };
}
