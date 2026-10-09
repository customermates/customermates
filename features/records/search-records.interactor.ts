import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordModel } from "./record-model.schema";
import type { RecordSearchRow } from "./record-search-query";
import type { RecordSearch, RecordSearchHit, RecordSearchResult } from "./record-search.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordInvariant } from "./record-invariant";
import { RecordSearchSchema } from "./record-search.schema";
import { CalculatedValueSchema } from "./record-model.schema";
import { recordWriteFailure } from "./mutate-record.interactor";
import { SIMILAR_TITLE_MIN_LENGTH } from "./record-search-query";

const QUOTED_PHRASE = /^"(.+)"$/su;

export function parseRecordSearchTerm(searchTerm: string): { term: string; similarTitles: boolean } {
  const quoted = QUOTED_PHRASE.exec(searchTerm)?.[1]?.trim();
  if (quoted) return { term: quoted, similarTitles: false };
  return { term: searchTerm, similarTitles: Array.from(searchTerm).length >= SIMILAR_TITLE_MIN_LENGTH };
}

export function recordSearchHit(row: RecordSearchRow, model: RecordModel, canEdit = false): RecordSearchHit {
  const type = recordInvariant(model.types.find((type) => type.id === row.typeId));
  return {
    ref: { typeId: row.typeId, recordId: row.recordId },
    title:
      row.state === "value" && row.title !== null
        ? { state: "value", value: { kind: "text", value: row.title } }
        : row.state === "error"
          ? CalculatedValueSchema.parse({ state: "error", code: row.errorCode })
          : row.state === "restricted"
            ? { state: "restricted" }
            : { state: "missing" },
    typeLabel: type.label,
    typePluralLabel: type.pluralLabel,
    icon: type.icon,
    pictureUrl: row.pictureUrl,
    canEdit: canEdit && !row.protectedKind,
  };
}

@AllowInDemoMode
@TenantInteractor()
export class SearchRecordsInteractor extends AuthenticatedInteractor<RecordSearch, RecordSearchResult> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(RecordSearchSchema)
  async invoke(input: RecordSearch): Validated<RecordSearchResult> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        if (input.cursor && input.cursor.revision !== model.revision)
          return failConflict(CustomErrorCode.recordSchemaChanged);
        try {
          const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
          const { term, similarTitles } = parseRecordSearchTerm(input.searchTerm);
          const search = { ...input, searchTerm: term };
          const includeEmbedded = input.includeEmbedded === true;
          const exact = await this.records.searchRecords({ search, includeEmbedded }, model, access);
          const similar =
            exact.length === 0 && similarTitles && !input.cursor
              ? await this.records.searchRecords({ search, includeEmbedded, similarTitles }, model, access)
              : [];
          const rows = exact.length > 0 ? exact : similar.slice(0, input.limit);
          const selected = rows.slice(0, input.limit);
          const last = selected.at(-1);
          return {
            ok: true,
            data: {
              results: selected.map((row) => recordSearchHit(row, model, policy.allowed(row.typeId, "update"))),
              schemaRevision: model.revision,
              nextCursor:
                rows.length > input.limit && last
                  ? {
                      revision: model.revision,
                      createdAt: last.createdAt,
                      ref: { typeId: last.typeId, recordId: last.recordId },
                    }
                  : null,
            },
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
