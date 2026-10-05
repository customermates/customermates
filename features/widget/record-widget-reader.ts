import type { RecordRepo } from "@/features/records/record.repo";
import type { QueryRecordMeasureInteractor } from "@/features/records/query-record-measure.interactor";
import type { RecordMeasure, RecordMeasureResult } from "@/features/records/record-measure.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordWidgetDto, StoredRecordWidget } from "./record-widget.schema";
import { runInTransaction } from "@/core/decorators/transaction-runner";

type WidgetGroupOption = RecordWidgetDto["groupOptions"][number];

export type RecordWidgetPreview = { result: RecordMeasureResult; groupOptions: WidgetGroupOption[] };

export type WidgetMemberDirectory = {
  resolveUserOptions(ids: string[]): Promise<Array<{ id: string; firstName: string; lastName: string }>>;
};

export class RecordWidgetReader {
  constructor(
    private records: RecordRepo,
    private measures: QueryRecordMeasureInteractor,
    private members: WidgetMemberDirectory,
  ) {}

  read(row: StoredRecordWidget): Promise<RecordWidgetDto> {
    return runInTransaction(
      async () => {
        const result = await this.measures.invoke(row.measure);
        if (!result.ok) return { ...row, status: "unavailable" as const, data: null, groupOptions: [] };
        return {
          ...row,
          status: "ready" as const,
          data: result.data,
          groupOptions: await this.groupOptions(result.data),
        };
      },
      { readOnly: true, timeout: 30000 },
    );
  }

  preview(measure: RecordMeasure): Validated<RecordWidgetPreview> {
    return runInTransaction(
      async () => {
        const result = await this.measures.invoke(measure);
        if (!result.ok) return result;
        return { ok: true as const, data: { result: result.data, groupOptions: await this.groupOptions(result.data) } };
      },
      { readOnly: true, timeout: 30000 },
    );
  }

  private async groupOptions(data: RecordMeasureResult): Promise<WidgetGroupOption[]> {
    const members = [
      ...new Set(
        data.groups.flatMap((group) =>
          group.label.state === "value" &&
          group.label.value.kind === "member" &&
          typeof group.label.value.value === "string"
            ? [group.label.value.value]
            : [],
        ),
      ),
    ];
    if (members.length) {
      const users = await this.members.resolveUserOptions(members);
      return users.map((user) => ({ id: user.id, label: `${user.firstName} ${user.lastName}`.trim(), color: null }));
    }
    const model = await this.records.getModel();
    const fieldId = data.groups.find((group) => group.fieldId)?.fieldId;
    const field = model.fields.find((candidate) => candidate.id === fieldId && !candidate.archived);
    return (
      field?.options.map(({ id, label, color, attributes }) => {
        const probability = attributes.find((attribute) => attribute.key === "probability")?.value;
        return {
          id,
          label,
          color,
          ...(probability?.kind === "decimal" && typeof probability.value === "string"
            ? { probability: probability.value }
            : {}),
        };
      }) ?? []
    );
  }
}
