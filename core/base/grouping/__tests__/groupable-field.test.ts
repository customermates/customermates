import { describe, expect, it } from "vitest";
import {
  GROUPABLE_MODELS,
  GROUPING_ENUM,
  GROUPING_RELATIONS,
  dateGroupables,
  enumGroupable,
  enumGroupables,
  groupableFieldDtos,
  relationGroupable,
  relationGroupables,
} from "../groupable-field";

describe("system model grouping declarations", () => {
  it("declares only system models", () => {
    expect(GROUPABLE_MODELS).toEqual(["user", "company", "operatorAudit", "routine"]);
    expect(Object.keys(GROUPING_ENUM).sort()).toEqual([...GROUPABLE_MODELS].sort());
    expect(Object.keys(GROUPING_RELATIONS).sort()).toEqual([...GROUPABLE_MODELS].sort());
  });
  it("declares the routine owner as its only relation", () => {
    expect(relationGroupable({ model: "routine", field: "ownerUserId" })).toEqual({
      kind: "relation",
      field: "ownerUserId",
      model: "routine",
      labelKey: "Common.filters.fields.ownerUserId",
    });
    expect(relationGroupables("routine", { ownerUserId: false })).toEqual([]);
    expect(relationGroupables("routine", { ownerUserId: true })).toHaveLength(1);
  });
  it("provides the shared subscription and user status enums", () => {
    expect(GROUPING_ENUM.user.plan).toBe(GROUPING_ENUM.company.plan);
    expect(GROUPING_ENUM.user.subscriptionStatus).toBe(GROUPING_ENUM.company.subscriptionStatus);
    expect(enumGroupable({ model: "user", field: "status" }).kind).toBe("enum");
    expect(enumGroupables("user", { status: true, plan: false, subscriptionStatus: false })).toHaveLength(1);
  });
  it("refuses undeclared fields rather than constructing an arbitrary database column", () => {
    expect(() => relationGroupable({ model: "routine", field: "injected" as never })).toThrow("No grouping relation");
    expect(() => enumGroupable({ model: "user", field: "injected" as never })).toThrow("No grouping enum");
  });
  it("expands every supported date bucket and disables system drag writes", () => {
    const specs = dateGroupables("user", { createdAt: true, updatedAt: false });
    const dtos = groupableFieldDtos([
      ...specs,
      enumGroupable({ model: "user", field: "status" }),
      relationGroupable({ model: "routine", field: "ownerUserId" }),
    ]);
    expect(dtos.filter((dto) => dto.kind === "dateBucket").map((dto) => dto.bucket)).toEqual(["day", "week", "month"]);
    expect(dtos.every((dto) => !dto.supportsDragWriteBack)).toBe(true);
  });
});
