import type { z } from "zod";
import type { AgentRetrievalCharge, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import type { AppLocale } from "@/i18n/locale-registry";
import type { WikiWebsiteCrawlRepo } from "./wiki-website-crawl.repo";
import type { WikiCrawlRecord, WikiSourceRecord } from "./wiki-website-crawl.service";
import type { WikiSynthesisCandidate, WikiSynthesisReviewDecision } from "./wiki-synthesis-review";
import type { StoredWikiSynthesisTopic, WikiSynthesisDraft, WikiSynthesisRole } from "./wiki-synthesis.schema";
import type { WikiSynthesisSkipReason } from "@/features/wiki/wiki-crawl-progress.schema";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { classifyMetered } from "@/ee/agent-chat/classifier/metered";
import { classifierReservationMicrocents } from "@/ee/agent-chat/classifier/classifier-reservation";
import { JEV_MODEL_ID } from "@/ee/agent-chat/classifier/jev-runner";
import { INITIAL_WIKI_SYNTHESIS_MODEL, SHIPPED_AGENT_MODEL } from "@/ee/agent-chat/model-catalog";
import { wikiLanguageConflicts } from "@/features/wiki/wiki-language";
import { wikiPageMarkdownLink } from "@/features/wiki/wiki-links";
import { hasInvalidWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { WIKI_TITLE_MAX_LENGTH, WIKI_WHEN_TO_USE_MAX_LENGTH, wikiPageKindIssue } from "@/features/wiki/wiki.schema";
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
  WIKI_SYNTHESIS_FOUNDATION_ROLES,
  WIKI_SYNTHESIS_MAX_PAGES,
  WIKI_SYNTHESIS_MAX_TOPIC_SOURCES,
  WikiSynthesisDraftSchema,
  WikiSynthesisPlanSchema,
} from "./wiki-synthesis.schema";

const PAGE_SOURCE_BUDGET_CHARACTERS = 120_000;
const INVENTORY_ENTRY_MAX_CHARACTERS = 2_000;
const WIKI_SYNTHESIS_MAX_REPAIRS = 2;
const REQUIRED_ROLES = [...WIKI_SYNTHESIS_FOUNDATION_ROLES, "operating_guide"] as const;
const ROLE_ORDER: Record<WikiSynthesisRole, number> = {
  company_overview: 0,
  customers_and_use_cases: 1,
  sales_messaging: 2,
  voice_and_tone: 3,
  offering: 4,
  procedure: 5,
  operating_guide: 6,
};
const TOPIC_TAKEN = new Error("Knowledge Base synthesis topic was settled by another delivery.");
const TOPIC_CLAIM_STALE_MS = 20 * 60 * 1_000;
const TOPIC_WAIT_MS = 12 * 60 * 1_000;
const TOPIC_POLL_MS = 2_000;

type Sources = { list: WikiSourceRecord[]; byId: Map<string, WikiSourceRecord>; keys: Map<string, string> };
type Metered<T> = { value: T; charge: AgentRetrievalCharge | null };
type SynthesizedPage = { title: string; kind: WikiSynthesisCandidate["kind"]; whenToUse?: string; markdown: string };
type TopicOutcome = { kind: "skipped"; reason: WikiSynthesisSkipReason } | { kind: "page"; page: SynthesizedPage };

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
    const model = crawl.mode === "initial" ? INITIAL_WIKI_SYNTHESIS_MODEL : SHIPPED_AGENT_MODEL;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await this.metered(
        crawl,
        wikiSynthesisWorstCaseMicrocents(model, system, prompt),
        model.modelId,
        async () => {
          const { output, charge } = await generateWikiSynthesisObject({ model, schema, system, prompt });
          return { value: output, charge };
        },
      );
      if (!result.ok || result.value !== null) return result;
    }
    return { ok: true as const, value: null };
  }

  async plan(crawlId: string): Promise<number> {
    const crawl = await this.load(crawlId);
    if (crawl.status !== "synthesizing") return 0;
    if (crawl.topics) return crawl.topics.length;
    const sources = await this.sources(crawlId);
    const imported = await this.importedSourceIds(sources.list);
    const existingTitles = await this.repo.listPageTitles();
    const passages = wikiSourcePlanningPassages(sources.list);
    const headings = wikiSourceHeadings(sources.list);
    const locale = appLocaleOrDefault(crawl.locale);
    const inventory = sources.list.map((source, index) =>
      encodeJson({
        key: `s${index + 1}`,
        imported: imported.has(source.id),
        url: source.url,
        title: source.title,
        category: source.category,
        headings: (headings.get(source.id) ?? []).slice(0, 12),
        passages: passages.get(source.id) ?? [],
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
      existingTitles.length ? `Existing Knowledge Base pages: ${encodeJson(existingTitles.slice(0, 200))}` : "",
      "Inventory, one source per line:",
      ...inventory,
    ]
      .filter(Boolean)
      .join("\n");

    const plan = await this.generate(crawl, WikiSynthesisPlanSchema, system, prompt);
    const topics =
      plan.ok && plan.value ? await this.normalizePlan(crawl, sources, plan.value.topics, existingTitles) : [];
    await this.repo.storePlannedTopics(
      crawlId,
      topics,
      topics.length === 0 ? (plan.ok ? "synthesis" : "credits") : null,
    );
    return (await this.load(crawlId)).topics?.length ?? 0;
  }

  private async normalizePlan(
    crawl: WikiCrawlRecord,
    sources: Sources,
    planned: Array<{ title: string; role: WikiSynthesisRole; sources: string[] }>,
    existingTitles: readonly string[],
  ): Promise<StoredWikiSynthesisTopic[]> {
    const initial = crawl.mode === "initial";
    const singular = new Set<WikiSynthesisRole>(REQUIRED_ROLES);
    const homepage = sources.list.find((source) => source.url === crawl.homepageUrl) ?? sources.list[0];
    const taken = new Set(existingTitles.map((title) => title.trim().toLocaleLowerCase()));
    const roles = new Set<WikiSynthesisRole>();
    const topics: StoredWikiSynthesisTopic[] = [];
    const add = (title: string, role: WikiSynthesisRole, sourceIds: string[]) => {
      const trimmed = title.trim().slice(0, WIKI_TITLE_MAX_LENGTH);
      const key = trimmed.toLocaleLowerCase();
      if (!trimmed || taken.has(key) || sourceIds.length === 0) return;
      if (!initial && singular.has(role)) return;
      if (singular.has(role) && roles.has(role)) return;
      taken.add(key);
      roles.add(role);
      topics.push({
        title: trimmed,
        role,
        sourceIds: [...new Set(sourceIds)].slice(0, WIKI_SYNTHESIS_MAX_TOPIC_SOURCES),
        status: "pending",
      });
    };
    for (const topic of planned) {
      const sourceIds = topic.sources.flatMap((source) => sources.keys.get(source.trim()) ?? []);
      add(topic.title, topic.role, sourceIds.length || topic.role !== "operating_guide" ? sourceIds : [homepage.id]);
    }
    if (initial && homepage) {
      const companySources = [
        homepage.id,
        ...sources.list.filter(({ category }) => category === "about" || category === "customers").map(({ id }) => id),
      ];
      const t = await getTranslator(appLocaleOrDefault(crawl.locale), "WikiSetup.generated");
      const titles: Record<(typeof REQUIRED_ROLES)[number], string> = {
        company_overview: t("roles.company_overview"),
        customers_and_use_cases: t("roles.customers_and_use_cases"),
        sales_messaging: t("roles.sales_messaging"),
        voice_and_tone: t("roles.voice_and_tone"),
        operating_guide: t("roles.operating_guide"),
      };
      for (const role of REQUIRED_ROLES) if (!roles.has(role)) add(titles[role], role, companySources);
    }
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
    if (crawl.status !== "synthesizing" || !topic) return;
    if (!(await this.repo.claimSynthesisTopic(crawlId, index, new Date(Date.now() - TOPIC_CLAIM_STALE_MS)))) {
      await this.waitForTopic(crawlId, index);
      return;
    }

    let outcome: TopicOutcome;
    try {
      outcome = await this.synthesizeTopic(crawl, topic);
    } catch {
      outcome = { kind: "skipped", reason: "error" };
    }
    if (outcome.kind === "skipped") {
      await this.repo.settleSynthesisTopic(crawlId, index, { status: "skipped", skipReason: outcome.reason });
      return;
    }
    const page = outcome.page;
    try {
      const saved = await runInTransaction(async () => {
        const created = await this.createPages.invoke({ requireEmpty: false, pages: [page] });
        if (!created.ok) return false;
        if (!(await this.repo.settleSynthesisTopic(crawlId, index, { status: "created", pageId: created.data[0].id })))
          throw TOPIC_TAKEN;
        return true;
      });
      if (saved) return;
    } catch (error) {
      if (error === TOPIC_TAKEN) return;
    }
    await this.repo.settleSynthesisTopic(crawlId, index, { status: "skipped", skipReason: "persistence" });
  }

  private async waitForTopic(crawlId: string, index: number) {
    const deadline = Date.now() + TOPIC_WAIT_MS;
    while (Date.now() < deadline) {
      const crawl = await this.load(crawlId);
      if (crawl.status !== "synthesizing" || crawl.topics?.[index]?.status !== "writing") return;
      await new Promise((resolve) => setTimeout(resolve, TOPIC_POLL_MS));
    }
  }

  private async synthesizeTopic(crawl: WikiCrawlRecord, topic: StoredWikiSynthesisTopic): Promise<TopicOutcome> {
    const locale = appLocaleOrDefault(crawl.locale);
    const sources = await this.sources(crawl.id);
    const cited = topic.sourceIds.flatMap((id) => sources.byId.get(id) ?? []);
    const keyOf = new Map([...sources.keys].map(([key, id]) => [id, key]));
    const savedPages = (crawl.topics ?? []).flatMap(({ title, status, pageId }) =>
      status === "created" && pageId ? [{ title, pageId }] : [],
    );
    const perSource = Math.floor(PAGE_SOURCE_BUDGET_CHARACTERS / Math.max(1, cited.length));
    const system = `${WIKI_SYNTHESIS_PAGE_INSTRUCTION} ${wikiSynthesisRoleGuidance(topic.role)}`;
    const basePrompt = [
      `Knowledge Base language: ${languageName(locale)}.`,
      `Page title: ${topic.title}`,
      savedPages.length ? `Other Knowledge Base pages: ${encodeJson(savedPages.map(({ title }) => title))}` : "",
      "Cited sources:",
      ...cited.map(
        (source) =>
          `<source key="${keyOf.get(source.id)}" url=${encodeJson(source.url)}>\n${source.text
            .slice(0, perSource)
            .replaceAll("</source", "< /source")}\n</source>`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    const reviewSources = new Map(cited.map((source) => [source.id, { text: source.text.slice(0, perSource) }]));

    const draft = (feedback: string | null) =>
      this.generate(
        crawl,
        WikiSynthesisDraftSchema,
        system,
        feedback
          ? `${basePrompt}\n\nYour previous draft was rejected. Rewrite the whole page and fix:\n${feedback}`
          : basePrompt,
      );
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
              sourceId: sources.keys.get(source.trim()) ?? source,
              quote,
            })),
          })),
        gaps: value.gaps.map((gap) => gap.trim()).filter((gap) => gap && !wikiLanguageConflicts(gap, locale)),
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
    if (!first.value) return { kind: "skipped", reason: "generation" };
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
            `## ${t("pagesHeading")}\n\n${savedPages.map(({ title, pageId }) => `- ${wikiPageMarkdownLink(title, pageId)}`).join("\n")}`,
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
    if (hasInvalidWikiPageLinks(markdown, env.BASE_URL)) return { kind: "skipped", reason: "generation" };
    const procedure =
      candidate.kind === "procedure" &&
      wikiPageKindIssue({ kind: "procedure", whenToUse: candidate.whenToUse ?? null, markdown }) === null;
    return {
      kind: "page",
      page: {
        title: candidate.title,
        kind: candidate.kind === "procedure" && !procedure ? "knowledge" : candidate.kind,
        ...(procedure ? { whenToUse: candidate.whenToUse } : {}),
        markdown,
      },
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
    const topics = (crawl.topics ?? []).map(({ claimedAt: _claimedAt, ...topic }) =>
      topic.status === "pending" || topic.status === "writing"
        ? { ...topic, status: "skipped" as const, skipReason: "error" as const }
        : topic,
    );
    const usable = topics.some(({ status }) => status === "created") || crawl.importedPages > 0;
    const credits = topics.length > 0 && topics.every(({ skipReason }) => skipReason === "credits");
    await this.repo.claimCrawl(crawlId, ["synthesizing"], {
      status: usable ? "completed" : "failed",
      topics,
      failureReason: usable ? null : (crawl.failureReason ?? (credits ? "credits" : "synthesis")),
      finishedAt: new Date(),
    });
  }
}
