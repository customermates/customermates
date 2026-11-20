import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { decodeGetParams } from "@/core/utils/get-params";

import {
  automationKindFilter,
  canonicalAutomationsSearch,
  showsRoutinesOnly,
} from "../components/automation-kind-filter";

describe("the kind shortcut of the Automations page", () => {
  it("leaves a URL without the shortcut alone", () => {
    expect(canonicalAutomationsSearch({})).toBeNull();
    expect(canonicalAutomationsSearch({ filters: "automationKind:in:routine", page: "2" })).toBeNull();
  });

  it("turns kind=routine into the filter the list owns, so removing the filter removes it from the URL", () => {
    const search = canonicalAutomationsSearch({ kind: "routine" });

    expect(search).toBe("filters=automationKind%3Ain%3Aroutine");
    expect(new URLSearchParams(search ?? "").has("kind")).toBe(false);
    expect(decodeGetParams(new URLSearchParams(search ?? "")).filters).toEqual([automationKindFilter("routine")]);
  });

  it("keeps every other parameter, such as the routine an old link focuses", () => {
    const search = canonicalAutomationsSearch({ kind: "routine", focus: "routine:abc", tag: ["a", "b"] });

    expect(search).toBe("focus=routine%3Aabc&tag=a&tag=b&filters=automationKind%3Ain%3Aroutine");
  });

  it("lets filters already in the URL win and drops an unknown kind", () => {
    expect(canonicalAutomationsSearch({ kind: "routine", filters: "automationStatus:in:paused" })).toBe(
      "filters=automationStatus%3Ain%3Apaused",
    );
    expect(canonicalAutomationsSearch({ kind: "nonsense", page: "2" })).toBe("page=2");
    expect(canonicalAutomationsSearch({ kind: "nonsense" })).toBe("");
  });

  it("reads routines-only from the filters, not from a URL parameter", () => {
    expect(showsRoutinesOnly([automationKindFilter("routine")])).toBe(true);
    expect(showsRoutinesOnly([automationKindFilter("rule")])).toBe(false);
    expect(
      showsRoutinesOnly([
        { field: FilterFieldKey.automationKind, operator: FilterOperatorKey.in, value: ["routine", "rule"] },
      ]),
    ).toBe(false);
    expect(showsRoutinesOnly([])).toBe(false);
    expect(showsRoutinesOnly(undefined)).toBe(false);
  });
});
