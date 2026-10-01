import { FilterFieldKey } from "@/core/types/filter-field-key";
import { describe, expect, it } from "vitest";
import { groupScopeFragment, withFragment } from "../group-scope";
import { dateGroupable, enumGroupable, relationGroupable } from "../groupable-field";
import { NO_VALUE_GROUP_KEY } from "../grouping.schema";

const access = () => ({ companyId: "tenant", id: { in: ["member"] } });
describe("system grouping scopes", () => {
  it("preserves a pre-existing AND scope", () => {
    expect(withFragment({ companyId: "tenant", AND: { active: true } }, { id: "member" })).toEqual({
      companyId: "tenant",
      AND: [{ active: true }, { id: "member" }],
    });
  });
  it("validates enum keys and represents missing values explicitly", () => {
    const spec = enumGroupable({ model: "user", field: "status" });
    expect(groupScopeFragment({ spec, key: "active" }, access)).toEqual({ status: "active" });
    expect(groupScopeFragment({ spec, key: "unknown" }, access)).toEqual({ id: { in: [] } });
    expect(groupScopeFragment({ spec, key: NO_VALUE_GROUP_KEY }, access)).toEqual({ status: null });
  });
  it("checks relation visibility for an owner and the unassigned group", () => {
    const spec = relationGroupable({ model: "routine", field: "ownerUserId" });
    expect(groupScopeFragment({ spec, key: "member" }, access)).toEqual({ ownerUserId: "member", owner: access() });
    expect(groupScopeFragment({ spec, key: NO_VALUE_GROUP_KEY }, access)).toEqual({ NOT: { owner: access() } });
  });
  it("does not let unknown date keys produce an unscoped query", () => {
    const spec = dateGroupable({ model: "user", field: FilterFieldKey.createdAt });
    expect(
      groupScopeFragment({ spec, key: "unexpected", bucket: "month", now: "2026-09-05T08:00:00Z" }, access),
    ).toEqual({ id: { in: [] } });
  });
});
