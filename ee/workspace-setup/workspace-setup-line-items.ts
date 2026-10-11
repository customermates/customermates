import type { RecordRef } from "@/features/records/record-model.schema";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { GeneratedSampleList } from "./workspace-setup-samples";

import { presetId } from "@/features/records/crm-preset";
import { spreadsheetRecordId } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import { setupIdempotencyKey } from "@/features/workspace-setup/setup-references";

const GOLDEN_STEP = 0.618034;
const MAX_QUANTITY = 1_000;

export type SetupLineItemPlan = {
  deal: RecordRef;
  name: string | null;
  quantity: number;
  service: RecordRef | null;
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

function setupOfferings(answers: SetupAnswers): string[] {
  const value = answers.offerings?.value;
  return value?.format === "orderedList" ? value.items.map((item) => item.label) : [];
}

function roundedPrice(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  return String(Math.max(1, Math.round(value / step) * step));
}

export function sampleLineItemPlans(args: {
  companyId: string;
  setupId: string;
  samples: GeneratedSampleList[];
  imported: ReadonlySet<string>;
  answers: SetupAnswers;
}): SetupLineItemPlan[] {
  const dealType = presetId(args.companyId, "deal");
  const serviceType = presetId(args.companyId, "service");
  const rowsOf = (typeId: string) =>
    args.samples
      .filter((sample) => sample.typeId === typeId)
      .flatMap((sample) => importedRows(args.setupId, sample, args.imported));
  const services = rowsOf(serviceType).flatMap((row) => {
    const price = Number(row.cell(presetId(args.companyId, "service.amount")));
    return Number.isFinite(price) && price > 0
      ? [{ ref: row.ref, name: row.cell(presetId(args.companyId, "service.name")), price }]
      : [];
  });
  const size = setupDealSize(args.answers);
  const offerings = setupOfferings(args.answers);
  return rowsOf(dealType).flatMap((deal, index): SetupLineItemPlan[] => {
    const spread = (index * GOLDEN_STEP) % 1;
    const target = size ? size.min + (size.max - size.min) * spread : null;
    if (services.length) {
      const service = services[index % services.length];
      const quantity = target
        ? Math.min(MAX_QUANTITY, Math.max(1, Math.round(target / service.price)))
        : 1 + (index % 3);
      return [{ deal: deal.ref, name: service.name, quantity, service: service.ref, unitPrice: null }];
    }
    const unitPrice = target === null ? null : roundedPrice(target);
    if (!unitPrice) return [];
    return [
      {
        deal: deal.ref,
        name: offerings.length ? offerings[index % offerings.length] : null,
        quantity: 1,
        service: null,
        unitPrice,
      },
    ];
  });
}
