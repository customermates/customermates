import type { z } from "zod";
import { describe, expect, it } from "vitest";

import { canonicalIsoDateTime, isIsoDateTime } from "@/core/validation/iso-date-time";
import { validateCustomFieldDateTime } from "@/core/validation/validate-custom-field-date-time";

const issuesFor = (value: string | string[]) => {
  const issues: unknown[] = [];
  const ctx = { addIssue: (issue: unknown) => issues.push(issue) } as unknown as z.RefinementCtx;
  validateCustomFieldDateTime(value, ctx, ["customFieldValues", 0, "value"]);
  return issues;
};

describe("iso date time", () => {
  it("accepts a zoned timestamp with an offset, which the CRM previously rejected", () => {
    expect(isIsoDateTime("2026-09-08T16:00:00+02:00")).toBe(true);
    expect(isIsoDateTime("2026-09-08T16:00:00-05:00")).toBe(true);
    expect(isIsoDateTime("2026-09-08T16:00:00Z")).toBe(true);
    expect(isIsoDateTime("2026-09-08T16:00:00.000Z")).toBe(true);
  });

  it("still rejects a timestamp with no zone at all, which would be ambiguous", () => {
    expect(isIsoDateTime("2026-09-08T16:00:00")).toBe(false);
    expect(isIsoDateTime("2026-09-08")).toBe(false);
    expect(isIsoDateTime("not a date")).toBe(false);
  });

  it("canonicalises to a single stored representation so string comparison stays sound", () => {
    expect(canonicalIsoDateTime("2026-09-08T16:00:00+02:00")).toBe("2026-09-08T14:00:00.000Z");
    expect(canonicalIsoDateTime("2026-09-08T14:00:00Z")).toBe("2026-09-08T14:00:00.000Z");
  });

  it("maps the same instant expressed either way onto the same stored string", () => {
    expect(canonicalIsoDateTime("2026-09-08T16:00:00+02:00")).toBe(canonicalIsoDateTime("2026-09-08T14:00:00Z"));
  });

  it("survives a daylight saving boundary, where hand computed UTC goes wrong", () => {
    const summer = canonicalIsoDateTime("2026-08-15T12:00:00+02:00");
    const winter = canonicalIsoDateTime("2026-12-15T12:00:00+01:00");
    expect(summer).toBe("2026-08-15T10:00:00.000Z");
    expect(winter).toBe("2026-12-15T11:00:00.000Z");
  });

  it("lets the custom field validator through for an offset timestamp", () => {
    expect(issuesFor("2026-09-08T16:00:00+02:00")).toHaveLength(0);
  });

  it("keeps rejecting a zone-less value through the custom field validator", () => {
    expect(issuesFor("2026-09-08T16:00:00")).toHaveLength(1);
  });
});
