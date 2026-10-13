import { afterEach, describe, expect, it } from "vitest";

import {
  REGISTRY_FILES,
  membershipAdditions,
  registrySourceAdditions,
  reviewedAdditionsWithoutFollowUp,
  staleReviewedAdditions,
  staleRuleParameterConstants,
  unclassifiedRegistryConstants,
  unreviewedExceptionAdditions,
} from "./exception-membership";
import { exceptionNamedConstants, registryMembers } from "./exception-registry";
import { REVIEW_BASE_SHA, readBaseSource, reviewBaseSha } from "./review-base";
import { REPO_SCAN_TIMEOUT_MS } from "./walk";

const TEN_REGISTRY_FILES = [
  "design-system.test.ts",
  "design-unification.test.ts",
  "form-footer-actions.test.ts",
  "interactor-error-contract.test.ts",
  "prisma-model-ownership.test.ts",
  "raw-sql-tenancy.test.ts",
  "settings-area-and-contact-values.test.ts",
  "ui-wording.test.ts",
  "i18n-parity.test.ts",
  "locale-consumer-audit.test.ts",
];

const members = (source: string, name: string, valueIsMember = false) =>
  registryMembers("fixture.test.ts", source, name, { valueIsMember });

describe("exception registries are read from their syntax, never executed", () => {
  it("reads object keys, Set and array elements, and Map keys", () => {
    const source = `
      const REASON = "shared reason";
      const KEY = "via-constant.tsx";
      const KEYED_FIXTURE: Allowlist = { "a.tsx": "reason", b: REASON, [KEY]: "reason" };
      const SET_FIXTURE = new Set<string>(["x", "y"]);
      const ARRAY_FIXTURE = ["z"] as const;
      const MAP_FIXTURE = new Map([["m.ts", "reason"]]);
    `;
    expect(members(source, "KEYED_FIXTURE")).toEqual(["a.tsx", "b", "via-constant.tsx"]);
    expect(members(source, "SET_FIXTURE")).toEqual(["x", "y"]);
    expect(members(source, "ARRAY_FIXTURE")).toEqual(["z"]);
    expect(members(source, "MAP_FIXTURE")).toEqual(["m.ts"]);
    expect(members(source, "MISSING")).toBeUndefined();
  });

  it("keeps semantic values, rule lists and repeated entries as members but ignores reasons", () => {
    const source = `
      const RULES_FIXTURE = { "a.tsx": { rules: ["footer", "submit"], reason: "why" } };
      const CALLS_FIXTURE = new Map([["a.ts", ["log", "log"]]]);
      const CLASS_FIXTURE = new Map([["a.ts", "AError"]]);
      const COUNTEMAP_FIXTURE = new Map([["site", { count: 2, reason: "why" }]]);
    `;
    expect(members(source, "RULES_FIXTURE")).toEqual(["a.tsx [rules: footer]", "a.tsx [rules: submit]"]);
    expect(members(source, "CALLS_FIXTURE")).toEqual(["a.ts [log]", "a.ts [log] #2"]);
    expect(members(source, "CLASS_FIXTURE", true)).toEqual(["a.ts -> AError"]);
    expect(members(source, "COUNTEMAP_FIXTURE")).toEqual(["site [count=2]"]);
  });

  it("expands spreads of literal helper calls and of other literal constants", () => {
    const source = `
      const reviewed = (reason: string, sites: readonly string[]) => sites.map((site) => [site, { count: 1, reason }]);
      const BASE_FIXTURE = ["one"];
      const SITES_FIXTURE = new Map([...reviewed("why", ["s1", "s2"]), ["s3", "why"]]);
      const ALL_FIXTURE = new Set([...BASE_FIXTURE, "two"]);
    `;
    expect(members(source, "SITES_FIXTURE")).toEqual(["s1", "s2", "s3"]);
    expect(members(source, "ALL_FIXTURE")).toEqual(["one", "two"]);
  });

  it("rejects registries it cannot read statically", () => {
    expect(() => members("const KEYED_FIXTURE = new Set(LIST.map((x) => x));", "KEYED_FIXTURE")).toThrow(
      /unsupported exception registry construction/,
    );
    expect(() => members("const KEYED_FIXTURE = { [key()]: 'why' };", "KEYED_FIXTURE")).toThrow(
      /unsupported exception registry construction/,
    );
    expect(() => members("const KEYED_FIXTURE = new Set([...load()]);", "KEYED_FIXTURE")).toThrow(
      /unsupported exception registry construction/,
    );
    expect(() => members("const KEYED_FIXTURE = new Map([[path, 'why']]);", "KEYED_FIXTURE")).toThrow(
      /unsupported exception registry construction/,
    );
  });

  it("finds top-level constants named as exceptions, but not local variables", () => {
    const source = `
      const SKIPPED_FILES = [];
      const knownViolations = new Set();
      const FOO_EXCEPTIONS = new Map();
      const OWNERS = new Set();
      function f() { const LOCAL_WAIVERS = {}; }
    `;
    expect(exceptionNamedConstants("fixture.ts", source)).toEqual([
      "SKIPPED_FILES",
      "knownViolations",
      "FOO_EXCEPTIONS",
    ]);
  });
});

describe("exception membership compares the head against the review base", () => {
  const registry = { name: "KEYED_FIXTURE" };

  it("reports added members, including a replacement that keeps the size", () => {
    expect(membershipAdditions(["a", "b"], ["a", "b"])).toEqual([]);
    expect(membershipAdditions(["a"], ["a", "b"])).toEqual([]);
    expect(membershipAdditions(["a", "c"], ["a", "b"])).toEqual(["c"]);
  });

  it("treats every member of a new or renamed registry as an addition", () => {
    const head = 'const SET_FIXTURE = { "a.tsx": "why" };';
    const base = 'const KEYED_FIXTURE = { "a.tsx": "why" };';
    expect(registrySourceAdditions("x.test.ts", { name: "SET_FIXTURE" }, head, base)).toEqual([
      "x.test.ts#SET_FIXTURE: a.tsx",
    ]);
    expect(registrySourceAdditions("x.test.ts", registry, base, undefined)).toEqual(["x.test.ts#KEYED_FIXTURE: a.tsx"]);
  });

  it("compares a moved registry with its base location", () => {
    const head = 'const SET_FIXTURE = { "a.tsx": "why", "b.tsx": "why" };';
    const base = 'const KEYED_FIXTURE = { "a.tsx": "why" };';
    const moved = { name: "SET_FIXTURE", base: { file: "old.test.ts", name: "KEYED_FIXTURE" } };
    expect(registrySourceAdditions("x.test.ts", moved, head, base)).toEqual(["x.test.ts#SET_FIXTURE: b.tsx"]);
  });

  it("counts a new rule on an existing exception key as an addition", () => {
    const head = 'const KEYED_FIXTURE = { "a.tsx": { rules: ["footer", "submit"], reason: "why" } };';
    const base = 'const KEYED_FIXTURE = { "a.tsx": { rules: ["footer"], reason: "other reason" } };';
    expect(registrySourceAdditions("x.test.ts", registry, head, base)).toEqual([
      "x.test.ts#KEYED_FIXTURE: a.tsx [rules: submit]",
    ]);
  });

  it("fails when a configured registry disappears instead of silently passing", () => {
    expect(() => registrySourceAdditions("x.test.ts", registry, "const OTHER = 1;", undefined)).toThrow(
      /no longer exists/,
    );
  });

  it("accepts a member whose path moved in a git rename, but not a changed site at the moved path", () => {
    const from = "app/[locale]/(protected)/profile/components/profile-settings-form.tsx";
    const to = "app/[locale]/(protected)/settings/(account)/components/profile-settings-form.tsx";
    expect(membershipAdditions([`${to} :: site`], [`${from} :: site`])).toEqual([]);
    expect(membershipAdditions([`${to} :: other site`], [`${from} :: site`])).toEqual([`${to} :: other site`]);
  });
});

describe("the review base must be available", () => {
  const supplied = process.env.CONVENTION_REVIEW_BASE;
  afterEach(() => {
    if (supplied === undefined) delete process.env.CONVENTION_REVIEW_BASE;
    else process.env.CONVENTION_REVIEW_BASE = supplied;
  });

  it("uses the immutable review base of PR #203 unless a merge-base is supplied", () => {
    delete process.env.CONVENTION_REVIEW_BASE;
    expect(reviewBaseSha()).toBe(REVIEW_BASE_SHA);
    expect(readBaseSource("tests/conventions/i18n-parity.test.ts")).toContain("ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS");
    expect(readBaseSource("tests/conventions/no-such-file.test.ts")).toBeUndefined();
  });

  it("fails clearly when the base commit is missing or malformed", () => {
    process.env.CONVENTION_REVIEW_BASE = "0123456789abcdef0123456789abcdef01234567";
    expect(() => reviewBaseSha()).toThrow(/is not available in this clone/);
    expect(() => readBaseSource("tests/conventions/i18n-parity.test.ts")).toThrow(/is not available in this clone/);
    process.env.CONVENTION_REVIEW_BASE = "main";
    expect(() => reviewBaseSha()).toThrow(/full 40-character commit sha/);
  });
});

describe("exception membership may only shrink (owner 2026-10-08)", () => {
  it("classifies every exception-named constant in tests/conventions", () => {
    expect(unclassifiedRegistryConstants()).toEqual([]);
    expect(staleRuleParameterConstants()).toEqual([]);
  });

  it("checks the ten audited registry files", () => {
    expect(TEN_REGISTRY_FILES.filter((file) => !(file in REGISTRY_FILES))).toEqual([]);
  });

  it(
    "adds no unreviewed members to the registries outside the ten audited files",
    () => {
      const others = Object.keys(REGISTRY_FILES).filter((file) => !TEN_REGISTRY_FILES.includes(file));
      expect(others.flatMap(unreviewedExceptionAdditions)).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );

  it("names the follow-up item or the unresolved policy reason of every reviewed addition", () => {
    expect(reviewedAdditionsWithoutFollowUp()).toEqual([]);
  });

  it(
    "keeps no reviewed addition that is no longer an addition",
    () => {
      expect(staleReviewedAdditions()).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );
});
