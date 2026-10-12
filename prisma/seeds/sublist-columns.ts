import { presetId } from "@/features/records/crm-preset";
import {
  SublistColumnsSchema,
  sublistColumnsP13nId,
  type SublistColumns,
} from "@/features/p13n/sublist-columns.schema";

import type { SeedContext } from "./context";
import { fixtureId } from "./helpers";
import { NORTHWIND_MEMBER_IDS } from "./northwind-model";

export const SYNTHETIC_SUBLIST_COLUMNS_P13N_ID_PREFIX = "4e100000";

type MemberKey = keyof typeof NORTHWIND_MEMBER_IDS;

const LINE_ITEM_COLUMNS = ["lineItem.quantity", "lineItem.effectivePrice", "lineItem.amount"] as const;
const PRICING_LINE_ITEM_COLUMNS = [
  "lineItem.quantity",
  "lineItem.effectivePrice",
  "lineItem.discountPercent",
  "lineItem.amount",
] as const;

const LINE_ITEM_COLUMNS_BY_MEMBER: Record<MemberKey, readonly string[]> = {
  maxBergmann: LINE_ITEM_COLUMNS,
  sofiaRossi: PRICING_LINE_ITEM_COLUMNS,
  claraNeumann: PRICING_LINE_ITEM_COLUMNS,
  marcoSilva: PRICING_LINE_ITEM_COLUMNS,
  elenaHoffmann: LINE_ITEM_COLUMNS,
  kianRahimi: LINE_ITEM_COLUMNS,
  lauraFischer: LINE_ITEM_COLUMNS,
};

export function northwindSublistColumns(companyId: string, member: MemberKey): SublistColumns {
  return SublistColumnsSchema.parse({
    columns: LINE_ITEM_COLUMNS_BY_MEMBER[member].map((key) => presetId(companyId, key)),
  });
}

export async function seedSublistColumns(context: SeedContext): Promise<void> {
  const companyId = context.ids.company;
  const p13nId = sublistColumnsP13nId(presetId(companyId, "lineItem"));
  const members = Object.keys(NORTHWIND_MEMBER_IDS) as MemberKey[];
  for (const [index, member] of members.entries()) {
    const userId = NORTHWIND_MEMBER_IDS[member];
    const data = { companyId, userId, p13nId, settings: northwindSublistColumns(companyId, member) };
    await context.prisma.p13n.upsert({
      where: { companyId_userId_p13nId: { companyId, userId, p13nId } },
      create: { id: fixtureId(SYNTHETIC_SUBLIST_COLUMNS_P13N_ID_PREFIX, index + 1), ...data },
      update: data,
    });
  }
}
