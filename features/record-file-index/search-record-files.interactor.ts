import type { RelevanceFloor } from "@/core/retrieval/retrieval-pipeline";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordSearchHit } from "@/features/records/record-search.schema";
import type { SearchWikiPagesRepo } from "@/features/wiki/search-wiki-pages.repo";
import type { WikiQueryEmbedder } from "@/features/wiki/wiki-query-embedder";
import type { RecordFileIndexScheduler } from "./record-file-index-scheduler";
import type { RecordFileSearch, RecordFileSearchHit, RecordFileSearchResult } from "./record-file-index.schema";
import type { RecordFileSearchScope, RecordFileSection, SearchRecordFilesRepo } from "./search-record-files.repo";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fuseFullTextAndSemantic } from "@/core/retrieval/retrieval-pipeline";
import { RetrievalStopwatch } from "@/core/retrieval/retrieval-stopwatch";
import { unwoundFailure } from "@/core/validation/interactor-failure-server";
import { recordSearchHit } from "@/features/records/search-records.interactor";
import { wikiPlainText } from "@/features/wiki/wiki-content";
import { wikiCodePointBoundary } from "@/features/wiki/wiki-page-chunk";
import { wikiSnippet } from "@/features/wiki/wiki-section-location";
import { env } from "@/env";

import { RecordFileSearchSchema } from "./record-file-index.schema";

const RECORD_FILE_SEARCH_CANDIDATES = 30;
const RECORD_FILE_SECTION_MAX_LENGTH = 160;

export type RecordFileSemanticRetrieval = {
  embedder: WikiQueryEmbedder;
  scheduler: RecordFileIndexScheduler;
  relevanceFloor?: RelevanceFloor | null;
};

function sectionBody(section: RecordFileSection): string {
  const separator = section.text.indexOf("\n\n");
  return separator < 0 ? "" : section.text.slice(separator + 2);
}

function sectionLabel(heading: string): string {
  if (heading.length <= RECORD_FILE_SECTION_MAX_LENGTH) return heading;
  return `${heading.slice(0, wikiCodePointBoundary(heading, RECORD_FILE_SECTION_MAX_LENGTH - 1)).trimEnd()}…`;
}

@AllowInDemoMode
@TenantInteractor()
export class SearchRecordFilesInteractor extends AuthenticatedInteractor<RecordFileSearch, RecordFileSearchResult> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private files: SearchRecordFilesRepo,
    private headlines: Pick<SearchWikiPagesRepo, "sectionHeadlines">,
    private semantic: RecordFileSemanticRetrieval | null = null,
  ) {
    super();
  }

  @Validate(RecordFileSearchSchema)
  async invoke(data: RecordFileSearch): Validated<RecordFileSearchResult> {
    const stopwatch = new RetrievalStopwatch("files");
    try {
      return { ok: true as const, data: await this.search(data, stopwatch) };
    } catch (error) {
      return unwoundFailure(error);
    } finally {
      stopwatch.finish();
    }
  }

  private async search(data: RecordFileSearch, stopwatch: RetrievalStopwatch): Promise<RecordFileSearchResult> {
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor) return { items: [], retrieval: "keyword" };
    const active = model.types.filter((type) => !type.archived);
    const scope: RecordFileSearchScope = {
      model,
      access: policy.access(active.map((type) => type.id)),
      typeIds: active.filter((type) => !type.embedded && policy.canReadType(type.id)).map((type) => type.id),
    };
    const semantic = this.semantic && env.APP_MODE !== "demo" ? this.semantic : null;
    const fullTextSections = new Map<string, RecordFileSection>();
    const semanticSections = new Map<string, RecordFileSection>();
    let corrected: string | undefined;
    let stale = false;
    const fused = await fuseFullTextAndSemantic({
      query: data.query,
      stopwatch,
      fullText: async () => {
        const found = await this.files.fullTextFileCandidates(data.query, scope, RECORD_FILE_SEARCH_CANDIDATES);
        corrected = found.corrected;
        found.sections.forEach((section, id) => fullTextSections.set(id, section));
        return found;
      },
      embed: semantic ? (query, wait) => semantic.embedder.embedQuery(query, wait) : null,
      semantic: async ({ vector, model: embeddingModel }) => {
        const found = await this.files.semanticFileCandidates(
          vector,
          embeddingModel,
          scope,
          RECORD_FILE_SEARCH_CANDIDATES,
        );
        if (!found) return null;
        stale = found.stale;
        found.sections.forEach((section, id) => semanticSections.set(id, section));
        return found;
      },
      relevanceFloor: semantic?.relevanceFloor,
    });
    if (semantic && stale) await semantic.scheduler.schedule();

    const ids = fused.ranked.slice(0, data.limit);
    const targets = new Map((await this.files.getSearchTargets(ids)).map((target) => [target.id, target]));
    const chosen = ids.flatMap((id) => {
      const target = targets.get(id);
      const section = semanticSections.get(id) ?? fullTextSections.get(id);
      return target && section ? [{ target, section }] : [];
    });
    const refs = [
      ...new Map(
        chosen.map(({ target }) => [
          `${target.typeId}:${target.recordId}`,
          { typeId: target.typeId, recordId: target.recordId },
        ]),
      ).values(),
    ];
    const rows = refs.length ? await this.records.searchRecords({ refs }, model, scope.access) : [];
    const records = new Map<string, RecordSearchHit>(
      rows.map((row) => [
        `${row.typeId}:${row.recordId}`,
        recordSearchHit(row, model, policy.allowed(row.typeId, "update")),
      ]),
    );
    const headlines = await this.headlines.sectionHeadlines(
      corrected ?? data.query,
      chosen.map(({ section }) => wikiPlainText(sectionBody(section))),
    );
    const items = chosen.flatMap(({ target, section }, index): RecordFileSearchHit[] => {
      const record = records.get(`${target.typeId}:${target.recordId}`);
      if (!record) return [];
      return [
        {
          id: target.id,
          name: target.name,
          mimeType: target.mimeType,
          fieldId: target.fieldId,
          record,
          snippet: wikiSnippet(headlines[index] ?? ""),
          ...(section.heading ? { section: sectionLabel(section.heading) } : {}),
          offset: section.offset,
        },
      ];
    });
    return {
      items,
      ...(corrected ? { didYouMean: [corrected] } : {}),
      retrieval: fused.vector ? "semantic" : "keyword",
    };
  }
}
