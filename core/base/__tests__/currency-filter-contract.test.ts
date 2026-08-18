import type { Filter } from "@/core/base/base-get.schema";
import type { z } from "zod";

import { describe, expect, it, vi } from "vitest";

import { FilterSchema } from "@/core/base/base-get.schema";
import { FilterOperatorKey, defaultValidateFilters } from "@/core/base/base-query-builder";
import { canonicalFilterNumber, filterNumberValue } from "@/core/base/filter-value";
import { parseLocalizedNumberToCanonical } from "@/core/stores/intl-number";
import { decodeGetParams, encodeGetParams } from "@/core/utils/get-params";
import { validateCustomFieldCurrency } from "@/core/validation/validate-custom-field-currency";
import { CustomErrorCode } from "@/core/validation/validation.types";

const CURRENCY_FIELD = "16000000-0000-4000-8000-0000000000c1";

const PLAIN_DECIMAL = /^-?\d+(?:\.\d+)?$/u;

const CURRENCY_VALUE_OPERATORS = [
  FilterOperatorKey.equals,
  FilterOperatorKey.gt,
  FilterOperatorKey.gte,
  FilterOperatorKey.lt,
  FilterOperatorKey.lte,
] as const;

const CURRENCY_FILTERABLE_FIELD = {
  field: CURRENCY_FIELD,
  operators: [...CURRENCY_VALUE_OPERATORS, FilterOperatorKey.isNull, FilterOperatorKey.isNotNull],
};

function createMockCtx() {
  return { addIssue: vi.fn() } as unknown as z.RefinementCtx & { addIssue: ReturnType<typeof vi.fn> };
}

describe("canonical currency filter values", () => {
  it("gives the same canonical string for the same amount typed in different locales", () => {
    expect(parseLocalizedNumberToCanonical("1,234.5", "en-US")).toBe("1234.5");
    expect(parseLocalizedNumberToCanonical("1.234,5", "de-DE")).toBe("1234.5");
    expect(parseLocalizedNumberToCanonical("1 234,5", "fr-FR")).toBe("1234.5");
  });

  it("normalizes trailing separators, plus signs and bare fractions to a plain decimal", () => {
    expect(parseLocalizedNumberToCanonical("5.", "en-US")).toBe("5");
    expect(parseLocalizedNumberToCanonical(".5", "en-US")).toBe("0.5");
    expect(parseLocalizedNumberToCanonical("-1234.25", "en-US")).toBe("-1234.25");
    expect(parseLocalizedNumberToCanonical("0", "en-US")).toBe("0");
  });

  it("emits only plain decimal strings, never exponent notation", () => {
    expect(canonicalFilterNumber(1234.5)).toBe("1234.5");
    expect(canonicalFilterNumber(0)).toBe("0");
    expect(canonicalFilterNumber(-0)).toBe("0");
    expect(canonicalFilterNumber(1e21)).toMatch(PLAIN_DECIMAL);
    expect(canonicalFilterNumber(1e-7)).toMatch(PLAIN_DECIMAL);
    expect(canonicalFilterNumber(1e21)).not.toContain("e");
    expect(canonicalFilterNumber(Number.NaN)).toBeUndefined();
    expect(canonicalFilterNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("reads a stored canonical string back as the number the input displays", () => {
    expect(filterNumberValue("1234.5")).toBe(1234.5);
    expect(filterNumberValue("-0.25")).toBe(-0.25);
    expect(filterNumberValue("")).toBeUndefined();
    expect(filterNumberValue(undefined)).toBeUndefined();
    expect(filterNumberValue("1,5")).toBeUndefined();
  });
});

describe("FilterSchema currency values", () => {
  it.each(CURRENCY_VALUE_OPERATORS)("accepts the number the currency input used to emit for %s", (operator) => {
    expect(FilterSchema.parse({ field: CURRENCY_FIELD, operator, value: 1234.5 })).toEqual({
      field: CURRENCY_FIELD,
      operator,
      value: "1234.5",
    });
  });

  it.each(CURRENCY_VALUE_OPERATORS)("keeps accepting the canonical string form for %s", (operator) => {
    expect(FilterSchema.parse({ field: CURRENCY_FIELD, operator, value: "1234.5" })).toEqual({
      field: CURRENCY_FIELD,
      operator,
      value: "1234.5",
    });
  });

  it.each([0, -50, 0.25, -0.25])("normalizes %s without losing sign or precision", (value) => {
    const parsed = FilterSchema.parse({ field: CURRENCY_FIELD, operator: FilterOperatorKey.equals, value });

    expect(parsed).toEqual({
      field: CURRENCY_FIELD,
      operator: FilterOperatorKey.equals,
      value: String(value === 0 ? 0 : value),
    });
    expect(Number((parsed as { value: string }).value)).toBe(value);
  });

  it.each([FilterOperatorKey.isNull, FilterOperatorKey.isNotNull])("keeps %s value-less", (operator) => {
    expect(FilterSchema.parse({ field: CURRENCY_FIELD, operator, value: undefined })).toEqual({
      field: CURRENCY_FIELD,
      operator,
    });
  });

  it("leaves the relative window operator on its own numeric contract", () => {
    expect(FilterSchema.parse({ field: "createdAt", operator: FilterOperatorKey.inLastDays, value: 30 })).toEqual({
      field: "createdAt",
      operator: FilterOperatorKey.inLastDays,
      value: 30,
    });
  });

  it("normalizes numbers inside membership and range values", () => {
    expect(FilterSchema.parse({ field: CURRENCY_FIELD, operator: FilterOperatorKey.between, value: [1, 10] })).toEqual({
      field: CURRENCY_FIELD,
      operator: FilterOperatorKey.between,
      value: ["1", "10"],
    });
  });

  it("still rejects a value that is not a number at all", () => {
    expect(FilterSchema.safeParse({ field: CURRENCY_FIELD, operator: FilterOperatorKey.gt, value: {} }).success).toBe(
      false,
    );
  });
});

describe("currency filter URL round trip", () => {
  it.each(CURRENCY_VALUE_OPERATORS)("restores %s to the value the session already holds", (operator) => {
    const applied = FilterSchema.parse({ field: CURRENCY_FIELD, operator, value: 1234.5 });

    const encoded = encodeGetParams({ filters: [applied] });
    const restored = decodeGetParams(encoded).filters;

    expect(encoded.getAll("filters")).toEqual([`${CURRENCY_FIELD}:${operator}:1234.5`]);
    expect(restored).toEqual([applied]);
  });

  it("keeps an existing string-form URL usable", () => {
    const legacy = new URLSearchParams();
    legacy.append("filters", `${CURRENCY_FIELD}:gte:1234.5`);

    const restored = decodeGetParams(legacy).filters ?? [];

    expect(restored).toEqual([{ field: CURRENCY_FIELD, operator: FilterOperatorKey.gte, value: "1234.5" }]);
    expect(FilterSchema.parse(restored[0])).toEqual(restored[0]);
  });
});

describe("saved currency filter presets", () => {
  const PresetFilters = FilterSchema.array();

  it("accepts a preset holding a currency filter in either transport form", () => {
    expect(
      PresetFilters.parse([
        { field: CURRENCY_FIELD, operator: FilterOperatorKey.gte, value: 1000 },
        { field: CURRENCY_FIELD, operator: FilterOperatorKey.lt, value: "2000" },
      ]),
    ).toEqual([
      { field: CURRENCY_FIELD, operator: FilterOperatorKey.gte, value: "1000" },
      { field: CURRENCY_FIELD, operator: FilterOperatorKey.lt, value: "2000" },
    ]);
  });
});

describe("validateCustomFieldCurrency", () => {
  it.each(["100.50", "0", "-50", "1234.5678"])("accepts the canonical form %s", (value) => {
    const ctx = createMockCtx();
    validateCustomFieldCurrency(value, ctx, ["value"]);

    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it.each([".5", "5.", "+50", "1e-7"])("keeps accepting the record-write form %s", (value) => {
    const ctx = createMockCtx();
    validateCustomFieldCurrency(value, ctx, ["value"]);

    expect(ctx.addIssue).not.toHaveBeenCalled();
  });

  it.each(["1,5", "1.234,5", "12abc"])("reports %s as an invalid currency value", (value) => {
    const ctx = createMockCtx();
    validateCustomFieldCurrency(value, ctx, ["value"]);

    expect(ctx.addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ params: { error: CustomErrorCode.customFieldInvalidCurrency } }),
    );
  });
});

describe("defaultValidateFilters for currency fields", () => {
  it.each(CURRENCY_VALUE_OPERATORS)("keeps a canonical %s filter and its string value", (operator) => {
    const filters = [FilterSchema.parse({ field: CURRENCY_FIELD, operator, value: 10 })];

    expect(defaultValidateFilters({ filters, filterableFields: [CURRENCY_FILTERABLE_FIELD] })).toEqual([
      { field: CURRENCY_FIELD, operator, value: "10" },
    ]);
  });

  it("canonicalizes a residual number before it reaches the query", () => {
    const filters = [{ field: CURRENCY_FIELD, operator: FilterOperatorKey.gt, value: 10 }] as unknown as Filter[];

    expect(defaultValidateFilters({ filters, filterableFields: [CURRENCY_FILTERABLE_FIELD] })).toEqual([
      { field: CURRENCY_FIELD, operator: FilterOperatorKey.gt, value: "10" },
    ]);
  });

  it("drops an empty currency value instead of querying for it", () => {
    const filters = [{ field: CURRENCY_FIELD, operator: FilterOperatorKey.equals, value: "" }] as unknown as Filter[];

    expect(defaultValidateFilters({ filters, filterableFields: [CURRENCY_FILTERABLE_FIELD] })).toEqual([]);
  });
});
