import { describe, it, expect, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/contacts",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { parseOpenParam, serializeStack } from "../use-entity-drawer-stack";

const CONTACT_ID = "60000000-0000-4000-8000-000000000001";

describe("parseOpenParam", () => {
  it("returns an empty stack for a missing or blank param", () => {
    expect(parseOpenParam(null)).toEqual([]);
    expect(parseOpenParam("")).toEqual([]);
  });

  it("parses a single entry", () => {
    expect(parseOpenParam("contact:new")).toEqual([{ entityType: EntityType.contact, id: "new" }]);
  });

  it("preserves order across multiple entries", () => {
    expect(parseOpenParam(`contact:${CONTACT_ID},deal:new`)).toEqual([
      { entityType: EntityType.contact, id: CONTACT_ID },
      { entityType: EntityType.deal, id: "new" },
    ]);
  });

  it("drops unknown entity types and malformed tokens", () => {
    expect(parseOpenParam("bogus:1,contact:new,:x,deal:")).toEqual([{ entityType: EntityType.contact, id: "new" }]);
  });

  it("accepts every entity type reachable from the sidebar Add flow", () => {
    const raw = "contact:new,organization:new,deal:new,service:new,task:new";
    expect(parseOpenParam(raw).map((entry) => entry.entityType)).toEqual([
      EntityType.contact,
      EntityType.organization,
      EntityType.deal,
      EntityType.service,
      EntityType.task,
    ]);
  });
});

describe("serializeStack", () => {
  it("returns null for an empty stack so the caller deletes the param", () => {
    expect(serializeStack([])).toBeNull();
  });

  it("round-trips a parsed stack", () => {
    const raw = `contact:${CONTACT_ID},organization:new`;
    expect(serializeStack(parseOpenParam(raw))).toBe(raw);
  });
});

describe("popping the drawer stack", () => {
  const pop = (raw: string) => serializeStack(parseOpenParam(raw).slice(0, -1));

  it("returns to the parent entry instead of closing the whole stack", () => {
    expect(pop("contact:new,organization:new")).toBe("contact:new");
  });

  it("unwinds a three-deep stack one entry at a time", () => {
    expect(pop("contact:new,organization:new,deal:new")).toBe("contact:new,organization:new");
  });

  it("clears the param once the last entry is popped", () => {
    expect(pop("contact:new")).toBeNull();
  });
});
