import type { GetP13nRepo } from "@/features/p13n/get-p13n.interactor";
import type { EmbeddedSublistPage } from "./embedded-sublist";
import type { QueryRecordsInteractor } from "./query-records.interactor";
import type { RecordModelView, RecordRef } from "./record-model.schema";

import { readSublistColumns, sublistColumnsP13nId } from "@/features/p13n/sublist-columns.schema";

import { embeddedSublistLayout, embeddedSublistQueries, embeddedTotals } from "./embedded-sublist";

export class EmbeddedSublistReader {
  constructor(
    private query: QueryRecordsInteractor,
    private personalization: GetP13nRepo,
  ) {}

  async read(
    parent: RecordRef,
    model: Pick<RecordModelView, "types" | "fields" | "relationships">,
  ): Promise<Record<string, EmbeddedSublistPage>> {
    const sublists = model.types.flatMap((type) => {
      const relation = model.relationships.find((candidate) => candidate.id === type.parentRelationshipId);
      return type.embedded && relation?.targetTypeId === parent.typeId
        ? [{ typeId: type.id, relationId: relation.id }]
        : [];
    });
    const pages = await Promise.all(
      sublists.map(async ({ typeId, relationId }) => {
        const stored = await this.personalization.getP13n(sublistColumnsP13nId(typeId));
        const columns = readSublistColumns(stored?.settings)?.columns ?? null;
        const queries = embeddedSublistQueries({
          typeId,
          parentRelationId: relationId,
          parentRecordId: parent.recordId,
          shown: embeddedSublistLayout(model, typeId, relationId, columns).shown,
        });
        const [rows, totals] = await Promise.all([
          this.query.invoke(queries.rows()),
          queries.totals ? this.query.invoke(queries.totals) : null,
        ]);
        if (!rows.ok) return [];
        return [
          [typeId, { columns, rows: rows.data, totals: embeddedTotals(totals?.ok ? totals.data : null) }] as const,
        ];
      }),
    );
    return Object.fromEntries(pages.flat());
  }
}
