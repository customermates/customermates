import { describe, expect, it } from "vitest";
import { EntityType } from "@/generated/prisma";
import { createTranslator } from "next-intl";

import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";

import { ENTITY_TERMINOLOGY_PRESETS } from "../entity-terminology.constants";

const catalogs = { en, de } as const;
const expectedPresetMatrix = {
  [EntityType.contact]: ["contact", "person", "client", "lead"],
  [EntityType.organization]: ["organization", "company", "account"],
  [EntityType.deal]: ["deal", "opportunity", "project", "job"],
  [EntityType.service]: ["service", "product", "offering", "package"],
  [EntityType.task]: ["task", "todo", "actionItem", "followUp"],
} as const;

describe("entity terminology catalogs", () => {
  it("pins the approved preset matrix independently of production constants", () => {
    expect(ENTITY_TERMINOLOGY_PRESETS).toEqual(expectedPresetMatrix);
  });

  it.each(Object.entries(catalogs))("keeps %s presets aligned with the curated catalog", (_locale, messages) => {
    for (const entityType of Object.values(EntityType)) {
      const presets = messages.EntityTerminology.presets[entityType];
      expect(Object.keys(presets).sort()).toEqual([...ENTITY_TERMINOLOGY_PRESETS[entityType]].sort());

      for (const presetKey of ENTITY_TERMINOLOGY_PRESETS[entityType]) {
        const label = presets[presetKey as keyof typeof presets] as {
          singular: string;
          plural: string;
        };
        expect(label.singular).not.toBe("");
        expect(label.plural).not.toBe("");
      }
    }
  });

  it.each(Object.entries(catalogs))("keeps %s onboarding at Profile, Invite, and AI only", (_locale, messages) => {
    expect(Object.keys(messages.OnboardingWizard.steps)).toEqual(["ai", "invite", "profile"]);
  });

  it.each(Object.entries(catalogs))("keeps %s data-model relationships complete and dynamic", (_locale, messages) => {
    expect(messages.EntityTerminology.relationships.dataModelLabel).not.toBe("");
    expect(messages.EntityTerminology.relationships.howRecordsConnect).not.toBe("");
    expect(messages.EntityTerminology.relationships.linkedTo).not.toBe("");
    expect(messages.EntityTerminology.relationships.contactOrganizationSummary).toContain("{contacts}");
    expect(messages.EntityTerminology.relationships.contactOrganizationSummary).toContain("{organizations}");
    expect(messages.EntityTerminology.relationships.contactDealSummary).toContain("{contacts}");
    expect(messages.EntityTerminology.relationships.contactDealSummary).toContain("{deals}");
    expect(messages.EntityTerminology.relationships.organizationDealSummary).toContain("{organizations}");
    expect(messages.EntityTerminology.relationships.organizationDealSummary).toContain("{deals}");
    expect(messages.EntityTerminology.relationships.dealServiceSummary).toContain("{deals}");
    expect(messages.EntityTerminology.relationships.dealServiceSummary).toContain("{services}");
    expect(messages.EntityTerminology.relationships.taskScope).toContain("{tasks}");
  });

  it("renders German relationship copy without inflecting a configured record name", () => {
    const t = createTranslator({ locale: "de", messages: de });

    expect(
      t("EntityTerminology.relationships.organizationDealSummary", {
        deals: "Aufträge",
        organizations: "Unternehmen",
      }),
    ).toBe("Unternehmen sind mit Datensätzen vom Typ „Aufträge“ verknüpft.");
  });

  it.each(Object.entries(catalogs))("keeps %s workspace copy terminology-aware", (_locale, messages) => {
    expect(messages.Dashboard.aggregationTypes.count).toContain("{entities}");
    expect(messages.Dashboard.aggregationTypes.dealQuantity).toContain("{services}");
    expect(messages.Dashboard.aggregationTypes.dealQuantity).toContain("{deals}");
    expect(messages.Dashboard.aggregationTypes.dealValue).toContain("{deal}");
    expect(messages.Dashboard.aggregationTypes.dealValueRelated).toContain("{entity}");
    expect(messages.Dashboard.aggregationTypes.dealValueRelated).toContain("{deal}");
    expect(messages.Dashboard.tabs.dealFilters).toContain("{deals}");
    expect(messages.GlobalSearch.emptyPrompt).toContain("{contacts}");
    expect(messages.GlobalSearch.emptyPrompt).toContain("{organizations}");
    expect(messages.GlobalSearch.emptyPrompt).toContain("{deals}");
    expect(messages.GlobalSearch.emptyPrompt).toContain("{services}");
    expect(messages.TasksCard.systemTaskTooltip).toContain("{task}");
  });

  it("pins the approved labels for every new preset and the corrected German Offering", () => {
    expect(en.EntityTerminology.presets.contact.lead).toEqual({
      plural: "Leads",
      singular: "Lead",
    });
    expect(de.EntityTerminology.presets.contact.lead).toEqual({
      plural: "Leads",
      singular: "Lead",
    });
    expect(en.EntityTerminology.presets.deal.job).toEqual({
      plural: "Jobs",
      singular: "Job",
    });
    expect(de.EntityTerminology.presets.deal.job).toEqual({
      plural: "Aufträge",
      singular: "Auftrag",
    });
    expect(en.EntityTerminology.presets.service.package).toEqual({
      plural: "Packages",
      singular: "Package",
    });
    expect(de.EntityTerminology.presets.service.package).toEqual({
      plural: "Pakete",
      singular: "Paket",
    });
    expect(de.EntityTerminology.presets.service.offering).toEqual({
      plural: "Leistungen",
      singular: "Leistung",
    });
    expect(en.EntityTerminology.presets.task).toEqual({
      actionItem: { plural: "Action items", singular: "Action item" },
      followUp: { plural: "Follow-ups", singular: "Follow-up" },
      task: { plural: "Tasks", singular: "Task" },
      todo: { plural: "To-dos", singular: "To-do" },
    });
    expect(de.EntityTerminology.presets.task).toEqual({
      actionItem: { plural: "Action Items", singular: "Action Item" },
      followUp: { plural: "Follow-ups", singular: "Follow-up" },
      task: { plural: "Aufgaben", singular: "Aufgabe" },
      todo: { plural: "To-dos", singular: "To-do" },
    });
  });
});
