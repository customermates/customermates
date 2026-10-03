import type { z } from "zod";
import type { AgentRetrievalCharge, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import type { AppLocale } from "@/i18n/locale-registry";
import type { WikiWebsiteCrawlRepo } from "./wiki-website-crawl.repo";
import type { WikiCrawlRecord, WikiSourceRecord } from "./wiki-website-crawl.service";
import type { WikiSynthesisCandidate, WikiSynthesisReviewDecision } from "./wiki-synthesis-review";
import type {
  StoredWikiSynthesisTopic,
  WikiSynthesisDraft,
  WikiSynthesisRole,
  WikiSynthesisSkipReason,
} from "./wiki-synthesis.schema";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { classifyMetered } from "@/ee/agent-chat/classifier/metered";
import { classifierReservationMicrocents } from "@/ee/agent-chat/classifier/classifier-reservation";
import { JEV_MODEL_ID } from "@/ee/agent-chat/classifier/jev-runner";
import { INITIAL_WIKI_SYNTHESIS_MODEL } from "@/ee/agent-chat/model-catalog";
import { wikiLanguageConflicts } from "@/features/wiki/wiki-language";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import { hasInvalidWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { WIKI_TITLE_MAX_LENGTH, WIKI_WHEN_TO_USE_MAX_LENGTH } from "@/features/wiki/wiki.schema";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";
import { env } from "@/env";

import { wikiSourceHeadings } from "./wiki-source-inventory";
import { wikiSourcePlanningPassages } from "./wiki-source-planning-passages";
import { wikiSynthesisSectionMarkdown } from "./wiki-synthesis-markdown";
import { generateWikiSynthesisObject, wikiSynthesisWorstCaseMicrocents } from "./wiki-synthesis-model";
import {
  invalidWikiSynthesisEvidence,
  wikiSynthesisReviewDecision,
  wikiSynthesisReviewRequest,
  WIKI_SYNTHESIS_REVIEW_TIMEOUT_MS,
} from "./wiki-synthesis-review";
import {
  WIKI_SYNTHESIS_EXTEND_PLAN_INSTRUCTION,
  WIKI_SYNTHESIS_INITIAL_PLAN_INSTRUCTION,
  WIKI_SYNTHESIS_PAGE_INSTRUCTION,
  WIKI_SYNTHESIS_PLAN_INSTRUCTION,
  wikiSynthesisRoleGuidance,
} from "./wiki-synthesis-grounding";
import {
  parseStoredWikiSynthesisTopics,
  WIKI_SYNTHESIS_FOUNDATION_ROLES,
  WIKI_SYNTHESIS_MAX_PAGES,
  WIKI_SYNTHESIS_MAX_TOPIC_SOURCES,
  WikiSynthesisDraftSchema,
  WikiSynthesisPlanSchema,
} from "./wiki-synthesis.schema";

const PAGE_SOURCE_BUDGET_CHARACTERS = 120_000;
const WIKI_SYNTHESIS_MAX_REPAIRS = 2;
const INVENTORY_ENTRY_MAX_CHARACTERS = 2_000;
const ROLE_ORDER: Record<WikiSynthesisRole, number> = {
  company_overview: 0,
  customers_and_use_cases: 1,
  sales_messaging: 2,
  voice_and_tone: 3,
  offering: 4,
  procedure: 5,
  operating_guide: 6,
};

type Sources = { list: WikiSourceRecord[]; byId: Map<string, WikiSourceRecord>; keys: Map<string, string> };
type Metered<T> = { value: T; charge: AgentRetrievalCharge | null };

function languageName(locale: AppLocale) {
  return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale;
}

function encodeJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}

function pageKind(role: WikiSynthesisRole, whenToUse: string): WikiSynthesisCandidate["kind"] {
  if (role === "operating_guide") return "guide";
  return role === "procedure" && whenToUse ? "procedure" : "knowledge";
}

export class WikiWebsiteSynthesisService {
  constructor(
    private repo: WikiWebsiteCrawlRepo,
    private usage: Pick<AgentUsageService, "prepareRetrieval" | "reserveRetrieval" | "settleRetrieval">,
    private createPages: Pick<CreateWikiPagesInteractor, "invoke">,
  ) {}

  private async load(crawlId: string) {
    const crawl = await this.repo.getCrawl(crawlId);
    if (!crawl) throw new Error("Knowledge Base website crawl not found.");
    return crawl;
  }

  private async sources(crawlId: string): Promise<Sources> {
    const list = (await this.repo.listSources(crawlId)).sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    return {
      list,
      byId: new Map(list.map((source) => [source.id, source])),
      keys: new Map(list.map((source, index) => [`s${index + 1}`, source.id])),
    };
  }

  private async metered<T>(
    crawl: WikiCrawlRecord,
    worstCaseMicrocents: number,
    model: string,
    run: () => Promise<Metered<T>>,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    const grant = await this.usage.prepareRetrieval(crawl.userId, new Date(), "wikiSynthesis");
    const reservation = grant ? await this.usage.reserveRetrieval({ grant, worstCaseMicrocents, model }) : null;
    if (!reservation) return { ok: false };
    let charge: AgentRetrievalCharge | null = {
      model,
      inputTokens: 0,
      costMicrocents: reservation.reservedMicrocents,
      costSource: "estimated",
    };
    try {
      const result = await run();
      charge = result.charge;
      return { ok: true, value: result.value };
    } finally {
      await this.usage.settleRetrieval({ reservation, charge });
    }
  }

  private async generate<T>(crawl: WikiCrawlRecord, schema: z.ZodType<T>, system: string, prompt: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.metered(
        crawl,
        wikiSynthesisWorstCaseMicrocents(system, prompt),
        INITIAL_WIKI_SYNTHESIS_MODEL.modelId,
        async () => {
          const { output, charge } = await generateWikiSynthesisObject({ schema, system, prompt });
          return { value: output, charge };
        },
      );
      if (!result.ok || result.value !== null) return result;
    }
    return { ok: true as const, value: null };
  }

  async plan(crawlId: string): Promise<number> {
    const crawl = await this.load(crawlId);
    if (crawl.topics) return crawl.topics.length;
    const sources = await this.sources(crawlId);
    const imported = await this.importedSourceIds(sources.list);
    const passages = wikiSourcePlanningPassages(sources.list);
    const headings = wikiSourceHeadings(sources.list);
    const locale = appLocaleOrDefault(crawl.locale);
    const inventory = sources.list.map((source, index) =>
      encodeJson({
        key: `s${index + 1}`,
        url: source.url,
        title: source.title,
        category: source.category,
        headings: (headings.get(source.id) ?? []).slice(0, 12),
        passages: (passages.get(source.id) ?? []).map(({ text }) => text),
        imported: imported.has(source.id),
      }).slice(0, INVENTORY_ENTRY_MAX_CHARACTERS),
    );
    const system = [
      WIKI_SYNTHESIS_PLAN_INSTRUCTION,
      crawl.mode === "initial" ? WIKI_SYNTHESIS_INITIAL_PLAN_INSTRUCTION : WIKI_SYNTHESIS_EXTEND_PLAN_INSTRUCTION,
      `Plan at most ${WIKI_SYNTHESIS_MAX_PAGES} pages.`,
    ].join(" ");
    const prompt = [
      `Knowledge Base language: ${languageName(locale)}.`,
      `Website: ${crawl.homepageUrl}`,
      "Inventory, one source per line:",
      ...inventory,
    ].join("\n");

    const plan = await this.generate(crawl, WikiSynthesisPlanSchema, system, prompt);
    if (!plan.ok) {
      await this.repo.claimCrawl(crawlId, ["synthesizing"], {
        status: "failed",
        failureReason: "credits",
        finishedAt: new Date(),
      });
      return 0;
    }
    const topics = plan.value ? this.normalizePlan(crawl, sources, plan.value.topics) : [];
    if (topics.length === 0) {
      await this.repo.claimCrawl(crawlId, ["synthesizing"], {
        status: "failed",
        failureReason: "synthesis",
        finishedAt: new Date(),
      });
      return 0;
    }
    await this.repo.updateCrawl(crawlId, { topics });
    return topics.length;
  }

  private normalizePlan(
    crawl: WikiCrawlRecord,
    sources: Sources,
    planned: Array<{ title: string; role: WikiSynthesisRole; sources: string[] }>,
  ): StoredWikiSynthesisTopic[] {
    const allowed = new Set<WikiSynthesisRole>(
      crawl.mode === "initial"
        ? ["offering", "procedure", ...WIKI_SYNTHESIS_FOUNDATION_ROLES, "operating_guide"]
        : ["offering", "procedure"],
    );
    const singular = new Set<WikiSynthesisRole>([...WIKI_SYNTHESIS_FOUNDATION_ROLES, "operating_guide"]);
    const homepage = sources.list.find((source) => source.url === crawl.homepageUrl) ?? sources.list[0];
    const titles = new Set<string>();
    const roles = new Set<WikiSynthesisRole>();
    const topics: StoredWikiSynthesisTopic[] = [];
    for (const topic of planned) {
      const title = topic.title.trim().slice(0, WIKI_TITLE_MAX_LENGTH);
      const key = title.toLocaleLowerCase();
      if (!title || titles.has(key) || !allowed.has(topic.role)) continue;
      if (singular.has(topic.role) && roles.has(topic.role)) continue;
      let sourceIds = [...new Set(topic.sources.flatMap((source) => sources.keys.get(source.trim()) ?? []))];
      if (sourceIds.length === 0 && topic.role === "operating_guide" && homepage) sourceIds = [homepage.id];
      if (sourceIds.length === 0) continue;
      titles.add(key);
      roles.add(topic.role);
      topics.push({
        title,
        role: topic.role,
        sourceIds: sourceIds.slice(0, WIKI_SYNTHESIS_MAX_TOPIC_SOURCES),
        status: "pending",
      });
    }
    topics.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
    const required = topics.filter(({ role }) => singular.has(role));
    const rest = topics.filter(({ role }) => !singular.has(role)).slice(0, WIKI_SYNTHESIS_MAX_PAGES - required.length);
    return [...required, ...rest].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  }

  private async importedSourceIds(sources: WikiSourceRecord[]) {
    const imported = new Set<string>();
    for (const source of sources) {
      const page = await this.repo.findImportedPage(source.url);
      if (page?.sourceContentHash === source.contentHash) imported.add(source.id);
    }
    return imported;
  }

  async writeTopic(crawlId: string, index: number): Promise<void> {
    const crawl = await this.load(crawlId);
    const topic = crawl.topics?.[index];
    if (crawl.status !== "synthesizing" || !topic || topic.status !== "pending") return;
    const outcome = await this.synthesizeTopic(crawl, topic);
    if (outcome.kind === "skipped") {
      await this.updateTopic(crawlId, index, { status: "skipped", skipReason: outcome.reason });
      return;
    }
    const saved = await runInTransaction(async () => {
      const created = await this.createPages.invoke({ requireEmpty: false, pages: [outcome.page] });
      if (!created.ok) return false;
      await this.updateTopic(crawlId, index, { status: "created", pageId: created.data[0].id });
      return true;
    });
    if (!saved) await this.updateTopic(crawlId, index, { status: "skipped", skipReason: "persistence" });
  }

  private async updateTopic(crawlId: string, index: number, patch: Partial<StoredWikiSynthesisTopic>) {
    const crawl = await this.load(crawlId);
    const topics = crawl.topics?.map((topic, position) => (position === index ? { ...topic, ...patch } : topic));
    if (!topics) throw new Error("Knowledge Base synthesis plan is missing.");
    await this.repo.updateCrawl(crawlId, { topics: parseStoredWikiSynthesisTopics(topics) });
  }

  private async synthesizeTopic(
    crawl: WikiCrawlRecord,
    topic: StoredWikiSynthesisTopic,
  ): Promise<
    | { kind: "skipped"; reason: WikiSynthesisSkipReason }
    | {
        kind: "page";
        page: { title: string; kind: WikiSynthesisCandidate["kind"]; whenToUse?: string; markdown: string };
      }
  > {
    const locale = appLocaleOrDefault(crawl.locale);
    const sources = await this.sources(crawl.id);
    const cited = topic.sourceIds.flatMap((id) => sources.byId.get(id) ?? []);
    const keyOf = new Map([...sources.keys].map(([key, id]) => [id, key]));
    const idOf = sources.keys;
    const savedPages = (crawl.topics ?? []).flatMap(({ title, pageId }) => (pageId ? [{ title, pageId }] : []));
    const perSource = Math.floor(PAGE_SOURCE_BUDGET_CHARACTERS / Math.max(1, cited.length));
    const system = `${WIKI_SYNTHESIS_PAGE_INSTRUCTION} ${wikiSynthesisRoleGuidance(topic.role)}`;
    const basePrompt = [
      `Knowledge Base language: ${languageName(locale)}.`,
      `Page title: ${topic.title}`,
      savedPages.length ? `Other Knowledge Base pages:\n${savedPages.map((page) => `- ${page.title}`).join("\n")}` : "",
      "Cited sources:",
      ...cited.map(
        (source) =>
          `<source key="${keyOf.get(source.id)}" url="${source.url}">\n${source.text.slice(0, perSource)}\n</source>`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    const reviewSources = new Map(cited.map((source) => [source.id, { text: source.text.slice(0, perSource) }]));

    const draft = async (feedback: string | null) => {
      const prompt = feedback
        ? `${basePrompt}\n\nYour previous draft was rejected. Rewrite the whole page and fix:\n${feedback}`
        : basePrompt;
      return this.generate(crawl, WikiSynthesisDraftSchema, system, prompt);
    };
    const candidateOf = (value: WikiSynthesisDraft): WikiSynthesisCandidate => {
      const whenToUse = value.whenToUse.trim().slice(0, WIKI_WHEN_TO_USE_MAX_LENGTH);
      return {
        title: topic.title,
        kind: pageKind(topic.role, whenToUse),
        ...(topic.role === "procedure" && whenToUse ? { whenToUse } : {}),
        sourceIds: topic.sourceIds,
        sections: value.sections
          .filter(({ heading, content }) => heading.trim() && content.trim())
          .map((section) => ({
            heading: section.heading.trim(),
            content: section.content.trim(),
            evidence: section.evidence.map(({ source, quote }) => ({
              sourceId: idOf.get(source.trim()) ?? source,
              quote,
            })),
          })),
        gaps: value.gaps.map((gap) => gap.trim()).filter(Boolean),
      };
    };
    const problems = (candidate: WikiSynthesisCandidate) => {
      const invalid = new Set(invalidWikiSynthesisEvidence(candidate, reviewSources));
      candidate.sections.forEach((section, index) => {
        if (wikiLanguageConflicts(`${section.heading}\n${section.content}`, locale)) invalid.add(index);
      });
      return [...invalid];
    };

    const first = await draft(null);
    if (!first.ok) return { kind: "skipped", reason: "credits" };
    if (!first.value) return { kind: "skipped", reason: "evidence" };
    let candidate = candidateOf(first.value);
    let repairs = WIKI_SYNTHESIS_MAX_REPAIRS;
    const repair = async (feedback: string[]) => {
      repairs -= 1;
      const repaired = await draft(feedback.join("\n"));
      if (!repaired.ok) return false;
      if (repaired.value) candidate = candidateOf(repaired.value);
      return true;
    };

    for (;;) {
      const invalid = problems(candidate);
      if (invalid.length > 0 && repairs > 0) {
        const feedback = invalid.map(
          (index) =>
            `- Section "${candidate.sections[index].heading}": copy every evidence quote exactly from its cited source text and write the content in ${languageName(locale)}.`,
        );
        if (!(await repair(feedback))) return { kind: "skipped", reason: "credits" };
        continue;
      }
      candidate = { ...candidate, sections: candidate.sections.filter((_, index) => !invalid.includes(index)) };
      if (candidate.sections.length === 0) return { kind: "skipped", reason: "evidence" };

      const decision = await this.review(crawl, candidate, reviewSources, locale);
      if (decision === null) return { kind: "skipped", reason: "credits" };
      if (decision.kind === "supported") break;
      if (decision.kind === "unavailable") return { kind: "skipped", reason: "reviewUnavailable" };
      if (repairs > 0) {
        const feedback = decision.issues.map(({ section, decision: verdict }) =>
          section === null
            ? `- The title, procedure trigger or gaps are ${verdict}: keep only what the evidence supports.`
            : `- Section "${candidate.sections[section].heading}" is ${verdict}: ${
                verdict === "qualified"
                  ? "restore the source's attribution, conditions, status and limitations."
                  : "remove every claim its own evidence does not support."
              }`,
        );
        if (!(await repair(feedback))) return { kind: "skipped", reason: "credits" };
        continue;
      }
      if (decision.issues.some(({ section }) => section === null)) return { kind: "skipped", reason: "review" };
      const rejected = new Set(decision.issues.map(({ section }) => section));
      candidate = { ...candidate, sections: candidate.sections.filter((_, index) => !rejected.has(index)) };
      if (candidate.sections.length === 0) return { kind: "skipped", reason: "review" };
      break;
    }

    const t = await getTranslator(locale, "WikiSetup.generated");
    const guideLinks =
      topic.role === "operating_guide" && savedPages.length > 0
        ? [
            `## ${t("pagesHeading")}\n\n${savedPages.map((page) => `- [${page.title}](${wikiPagePath(page.pageId)})`).join("\n")}`,
          ]
        : [];
    const markdown = [
      ...candidate.sections.map(({ heading, content }) => `## ${heading}\n\n${wikiSynthesisSectionMarkdown(content)}`),
      ...guideLinks,
      `## ${t("sourcesHeading")}\n\n${cited
        .map((source) => `- <${source.url}> (${source.fetchedAt.toISOString().slice(0, 10)})`)
        .join("\n")}`,
      ...(candidate.gaps.length
        ? [`## ${t("gapsHeading")}\n\n${candidate.gaps.map((gap) => `- ${gap}`).join("\n")}`]
        : []),
    ].join("\n\n");
    if (hasInvalidWikiPageLinks(markdown, env.BASE_URL)) return { kind: "skipped", reason: "evidence" };
    return {
      kind: "page",
      page: { title: candidate.title, kind: candidate.kind, whenToUse: candidate.whenToUse, markdown },
    };
  }

  private async review(
    crawl: WikiCrawlRecord,
    candidate: WikiSynthesisCandidate,
    sources: ReadonlyMap<string, { text: string }>,
    locale: AppLocale,
  ): Promise<WikiSynthesisReviewDecision | null> {
    const request = wikiSynthesisReviewRequest(candidate, sources, locale);
    if (!request) return { kind: "unavailable" };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.metered(
        crawl,
        classifierReservationMicrocents(request.spec, request.state),
        JEV_MODEL_ID,
        async () => {
          const { result: answer, charge } = await classifyMetered(
            "wiki_synthesis_review",
            request.spec,
            request.state,
            "jev",
            { timeoutMs: WIKI_SYNTHESIS_REVIEW_TIMEOUT_MS },
          );
          return {
            value: wikiSynthesisReviewDecision(request, answer),
            charge: charge && {
              model: JEV_MODEL_ID,
              inputTokens: 0,
              costMicrocents: charge.costMicrocents,
              costSource: charge.measured ? ("measured" as const) : ("estimated" as const),
            },
          };
        },
      );
      if (!result.ok) return null;
      if (result.value.kind !== "unavailable") return result.value;
    }
    return { kind: "unavailable" };
  }

  async settle(crawlId: string): Promise<void> {
    const crawl = await this.load(crawlId);
    if (crawl.status !== "synthesizing") return;
    const topics = crawl.topics ?? [];
    const created = topics.some(({ status }) => status === "created");
    const credits = topics.length > 0 && topics.every(({ skipReason }) => skipReason === "credits");
    await this.repo.claimCrawl(crawlId, ["synthesizing"], {
      status: created || crawl.importedPages > 0 ? "completed" : "failed",
      failureReason: created || crawl.importedPages > 0 ? null : credits ? "credits" : "synthesis",
      finishedAt: new Date(),
    });
  }
}
