import type { RecordRef } from "@/features/records/record-model.schema";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { GeneratedSampleList } from "./workspace-setup-samples";

import { spreadsheetRecordId } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import { setupIdempotencyKey } from "@/features/workspace-setup/setup-references";

const GOLDEN_STEP = 0.618034;
const MAX_QUANTITY = 1_000;

export type SetupLineItemPlan = {
  deal: RecordRef;
  name: string | null;
  quantity: number;
  offering: RecordRef | null;
  unitPrice: string | null;
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

export function setupDealSize(answers: SetupAnswers): { min: number; max: number } | null {
  const value = answers.dealSize?.value;
  if (value?.format !== "range") return null;
  const max = value.max ?? value.min;
  return max > 0 ? { min: Math.min(value.min, max), max } : null;
}

function roundedPrice(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  return String(Math.max(1, Math.round(value / step) * step));
}

export function sampleLineItemPlans(args: {
  setupId: string;
  samples: GeneratedSampleList[];
  imported: ReadonlySet<string>;
  answers: SetupAnswers;
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
  const size = setupDealSize(args.answers);
  return rowsOf(args.deals).flatMap((deal, index): SetupLineItemPlan[] => {
    const spread = (index * GOLDEN_STEP) % 1;
    const target = size ? size.min + (size.max - size.min) * spread : null;
    if (offerings.length) {
      const offering = offerings[index % offerings.length];
      const quantity = target
        ? Math.min(MAX_QUANTITY, Math.max(1, Math.round(target / offering.price)))
        : 1 + (index % 3);
      return [{ deal: deal.ref, name: offering.name, quantity, offering: offering.ref, unitPrice: null }];
    }
    const unitPrice = target === null ? null : roundedPrice(target);
    return unitPrice ? [{ deal: deal.ref, name: null, quantity: 1, offering: null, unitPrice }] : [];
  });
}
