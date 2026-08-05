import { describe, it, expect } from "vitest";
import { EntityType } from "@/generated/prisma";

import { buildTerminologyMap, resolveEntityTerm, terminologyMessageKey } from "../entity-terminology.resolver";

const CATALOG: Record<string, string> = {
  "EntityTerminology.presets.contact.contact.singular": "Contact",
  "EntityTerminology.presets.contact.contact.plural": "Contacts",
  "EntityTerminology.presets.contact.client.singular": "Client",
  "EntityTerminology.presets.contact.client.plural": "Clients",
  "EntityTerminology.presets.deal.deal.singular": "Deal",
  "EntityTerminology.presets.deal.deal.plural": "Deals",
  "EntityTerminology.presets.task.task.singular": "Task",
  "EntityTerminology.presets.task.task.plural": "Tasks",
};

const translate = (key: string) => CATALOG[key] ?? key;

describe("resolveEntityTerm", () => {
  it("resolves the canonical default when there is no override", () => {
    expect(resolveEntityTerm(EntityType.contact, "singular", undefined, translate)).toBe("Contact");
    expect(resolveEntityTerm(EntityType.contact, "plural", undefined, translate)).toBe("Contacts");
  });

  it("resolves a configured preset through the translator so it can localize", () => {
    const override = { entityType: EntityType.contact, presetKey: "client" };
    expect(resolveEntityTerm(EntityType.contact, "singular", override, translate)).toBe("Client");
    expect(resolveEntityTerm(EntityType.contact, "plural", override, translate)).toBe("Clients");
  });

  it("resolves every label through the translator so i18n stays the only source of labels", () => {
    expect(resolveEntityTerm(EntityType.organization, "plural", undefined, translate)).toBe(
      "EntityTerminology.presets.organization.organization.plural",
    );
  });

  it("falls back to the canonical preset key when the stored preset is unknown", () => {
    const override = { entityType: EntityType.contact, presetKey: "not-a-preset" };
    expect(resolveEntityTerm(EntityType.contact, "plural", override, translate)).toBe("Contacts");
    expect(terminologyMessageKey(EntityType.contact, "not-a-preset", "plural")).toBe(
      "EntityTerminology.presets.contact.contact.plural",
    );
  });

  it("builds a full map covering every entity type", () => {
    const map = buildTerminologyMap([{ entityType: EntityType.deal, presetKey: "deal" }], translate);
    expect(Object.keys(map).sort()).toEqual([...Object.values(EntityType)].sort());
    expect(map[EntityType.deal].plural).toBe("Deals");
    expect(map[EntityType.task].singular).toBe("Task");
  });
});
