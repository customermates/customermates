import { describe, expect, it } from "vitest";

import { Currency, CustomColumnType, EntityType } from "@/generated/prisma";

import { CurrencySchema } from "../custom-column.schema";

const currencyColumn = {
  entityType: EntityType.contact,
  id: "00000000-0000-4000-8000-000000000001",
  label: "Budget",
  options: { currency: Currency.idr },
  type: CustomColumnType.currency,
};

describe("custom-column currency schema", () => {
  it("accepts IDR", () => {
    expect(CurrencySchema.safeParse(currencyColumn).success).toBe(true);
  });

  it.each(["xau", "xxx", "zzz"])("rejects unsupported currency code %s", (currency) => {
    expect(CurrencySchema.safeParse({ ...currencyColumn, options: { currency } }).success).toBe(false);
  });
});
