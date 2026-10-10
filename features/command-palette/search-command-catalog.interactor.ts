import type { QueryEmbedding, QueryVector } from "@/core/retrieval/retrieval-pipeline";
import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { Validated } from "@/core/validation/validation.utils";
import type { CommandCatalogRepo } from "./command-catalog.repo";
import type { SearchCatalogRepo } from "./search-catalog.repo";
import type { SearchCatalogIndexScheduler } from "./search-catalog-index-scheduler";
import type {
  CommandCatalogSearchResult,
  CommandDocsHit,
  CommandSearchInput,
  CommandSearchScope,
} from "./command-search.schema";

import { createHash } from "node:crypto";

import * as Sentry from "@sentry/nextjs";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Validate } from "@/core/decorators/validate.decorator";
import { QueryEmbeddingWait } from "@/core/retrieval/query-embedding-wait";
import { RETRIEVAL_RELEVANCE_FLOOR, withinDeadline } from "@/core/retrieval/retrieval-pipeline";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { commandAvailable, STATIC_COMMANDS } from "@/components/keyboard/command-registry";
import { appLinkHrefs, appLinkPath, parseAppLink } from "@/features/docs/app-links";
import { docsCorpus, docsCorpusSection } from "@/features/mcp-tools/docs-corpus";
import { DEFAULT_LOCALE, isContentLocale } from "@/i18n/locale-registry";
import { env } from "@/env";

import { commandCatalogScope } from "./command-catalog-scope";
import { CommandSearchInputSchema, SEMANTIC_MATCH_MIN_SIMILARITY } from "./command-search.schema";
import { staticSearchCatalog } from "./search-catalog-corpus";

export const COMMAND_SEARCH_EMBEDDING_WAIT_MS = 400;
const CATALOG_MATCH_LIMIT = 20;
const DOCS_MATCH_LIMIT = 3;
const SCOPED_DOCS_MATCH_LIMIT = 8;

const SCOPE_PREFIXES: Record<Exclude<CommandSearchScope, "docs" | "records">, readonly string[]> = {
  lists: ["list:"],
  views: ["view:"],
  settings: ["cmd:setting.", "cmd:settings."],
};

function inScope(key: string, scope: CommandSearchScope | null): boolean {
  if (scope === null) return true;
  if (scope === "docs" || scope === "records") return false;
  return SCOPE_PREFIXES[scope].some((prefix) => key.startsWith(prefix));
}

export function docsHref(slug: string, anchor: string, text: string): string {
  const link = appLinkHrefs(text)
    .map(parseAppLink)
    .find((parsed) => parsed !== null);
  return link ? appLinkPath(link, null) : `/docs/${slug}#${anchor}`;
}

export function catalogFingerprint(revision: number, views: ReadonlyArray<{ id: string; name: string }>): string {
  return createHash("sha256")
    .update(JSON.stringify([revision, views.map((view) => [view.id, view.name])]))
    .digest("hex");
}

@AllowInDemoMode
@TenantInteractor()
export class SearchCommandCatalogInteractor extends AuthenticatedInteractor<
  CommandSearchInput,
  CommandCatalogSearchResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private catalog: CommandCatalogRepo,
    private searchCatalog: SearchCatalogRepo,
    private docs: DocsChunkRepo,
    private embedQuery: QueryEmbedding | null,
    private scheduler: SearchCatalogIndexScheduler,
  ) {
    super();
  }

  @Validate(CommandSearchInputSchema)
  async invoke(input: CommandSearchInput): Validated<CommandCatalogSearchResult> {
    const loaded = await runInTransaction(
      async () => {
        const [model, policy, views] = await Promise.all([
          this.records.getModel(),
          this.policy.load(),
          this.catalog.listRecordViewNames(),
        ]);
        return { model, policy, views };
      },
      { readOnly: true },
    );
    if (!loaded.policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
    const empty = { semantic: [], docs: [], degraded: false };
    if (input.scope === "records") return { ok: true, data: empty };

    const { model, policy, views } = loaded;
    void this.scheduler.schedule(catalogFingerprint(model.revision, views));
    if (!input.semantic) return { ok: true, data: empty };
    const vector = await this.queryVector(input.searchTerm);
    if (!vector) return { ok: true, data: { ...empty, degraded: true } };

    const scope = commandCatalogScope(model, policy, views);
    const environment = {
      appMode: env.APP_MODE,
      canManageSchema: policy.canManageSchema,
      onListPage: true,
      can: policy.allowedSystem,
    };
    const allowed = new Set([
      ...STATIC_COMMANDS.filter((command) => commandAvailable(command, environment)).map(
        (command) => `cmd:${command.id}`,
      ),
      ...scope.lists.map((id) => `list:${id}`),
      ...scope.views.map((view) => `view:${view.id}`),
      ...scope.fields.map((field) => `field:${field.id}`),
    ]);
    const targetIds = [...allowed].filter((key) => inScope(key, input.scope));
    try {
      const [semantic, docs] = await Promise.all([
        targetIds.length === 0 ? Promise.resolve([]) : this.catalogMatches(input.locale, vector, targetIds),
        input.scope === null || input.scope === "docs"
          ? this.docsMatches(input.locale, vector, input.scope === "docs" ? SCOPED_DOCS_MATCH_LIMIT : DOCS_MATCH_LIMIT)
          : Promise.resolve([]),
      ]);
      return {
        ok: true,
        data: {
          semantic: semantic.map((match) => ({ key: match.targetId, similarity: match.similarity })),
          docs,
          degraded: false,
        },
      };
    } catch (error) {
      Sentry.captureException(error);
      return { ok: true, data: { ...empty, degraded: true } };
    }
  }

  private async queryVector(searchTerm: string): Promise<QueryVector | null> {
    const embedQuery = this.embedQuery;
    if (!embedQuery || !(await this.searchCatalog.semanticIndexAvailable())) return null;
    const wait = new QueryEmbeddingWait();
    const embedded = await withinDeadline(
      embedQuery(searchTerm, wait).catch(() => null),
      COMMAND_SEARCH_EMBEDDING_WAIT_MS,
      () => wait.abandon(),
    );
    return embedded?.value ?? null;
  }

  private async catalogMatches(locale: string, vector: QueryVector, targetIds: readonly string[]) {
    const catalog = await staticSearchCatalog();
    return this.searchCatalog.semanticMatches({
      companyId: this.companyId,
      buildHash: catalog.buildHash,
      locale,
      targetIds,
      vector: vector.vector,
      model: vector.model,
      minSimilarity: SEMANTIC_MATCH_MIN_SIMILARITY,
      limit: CATALOG_MATCH_LIMIT,
    });
  }

  private async docsMatches(locale: string, vector: QueryVector, limit: number): Promise<CommandDocsHit[]> {
    const docsLocale = isContentLocale(locale) ? locale : DEFAULT_LOCALE;
    const build = await this.docs.storedBuild(docsCorpus());
    if (!build) return [];
    const rows = await this.docs.semanticSections(
      { buildHash: build.buildHash, locale: docsLocale, sources: ["docs"] },
      vector.vector,
      vector.model,
      limit,
    );
    return (rows ?? []).flatMap((row) => {
      if (row.similarity < RETRIEVAL_RELEVANCE_FLOOR.similarity) return [];
      const section = docsCorpusSection(docsLocale, { source: row.source, slug: row.slug, order: row.sectionOrder });
      if (!section) return [];
      const heading = section.headingPath.at(-1);
      return [
        {
          key: `doc:${row.slug}#${row.anchor}`,
          title: section.pageTitle,
          section: heading && heading !== section.pageTitle ? heading : null,
          href: docsHref(row.slug, row.anchor, section.text),
          similarity: row.similarity,
        },
      ];
    });
  }
}
