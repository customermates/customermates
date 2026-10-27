import type { RecordRef } from "@/features/records/record-model.schema";
import type { GeneratedSampleList } from "./workspace-setup-samples";

import { spreadsheetRecordId } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import { setupIdempotencyKey } from "@/features/workspace-setup/setup-references";

type SetupLineItemPlan = {
  deal: RecordRef;
  name: string | null;
  quantity: number;
  offering: RecordRef;
};

type SampleRow = { ref: RecordRef; cell: (fieldId: string) => string | null };

function importedRows(setupId: string, sample: GeneratedSampleList, imported: ReadonlySet<string>): SampleRow[] {
  const key = setupIdempotencyKey(setupId, `sample:${sample.list}`);
  const columns = new Map(sample.mapping.columns.map((column) => [column.fieldId, column.column]));
  return sample.table.rows.flatMap((row) => {
    const recordId = spreadsheetRecordId(key, `record:${row.rowNumber}`);
    if (!imported.has(recordId)) return [];
    const cell = (fieldId: string) => {
      const column = columns.get(fieldId);
      const index = column ? sample.table.headers.indexOf(column) : -1;
      const value = index >= 0 ? row.cells[index] : null;
      return value === null || value === undefined ? null : String(value).trim() || null;
    };
    return [{ ref: { typeId: sample.typeId, recordId }, cell }];
  });
}

export function sampleLineItemPlans(args: {
  setupId: string;
  samples: GeneratedSampleList[];
  imported: ReadonlySet<string>;
  deals: string;
  offerings: { typeId: string; priceFieldId: string; nameFieldId: string | undefined };
}): SetupLineItemPlan[] {
  const rowsOf = (typeId: string) =>
    args.samples
      .filter((sample) => sample.typeId === typeId)
      .flatMap((sample) => importedRows(args.setupId, sample, args.imported));
  const offerings = rowsOf(args.offerings.typeId).flatMap((row) => {
    const price = Number(row.cell(args.offerings.priceFieldId));
    const name = args.offerings.nameFieldId ? row.cell(args.offerings.nameFieldId) : null;
    return Number.isFinite(price) && price > 0 ? [{ ref: row.ref, name, price }] : [];
  });
  if (!offerings.length) return [];
  return rowsOf(args.deals).map((deal, index): SetupLineItemPlan => {
    const offering = offerings[index % offerings.length];
    return { deal: deal.ref, name: offering.name, quantity: 1 + (index % 3), offering: offering.ref };
  });
}
