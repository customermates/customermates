import { describe, expect, it, vi } from "vitest";
import { EntityType, Resource } from "@/generated/prisma";

vi.mock("@/app/[locale]/(protected)/contacts/components/contact-detail-view", () => ({
  ContactDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/contacts/components/contact-detail-summary", () => ({
  ContactDetailSummary: () => null,
}));
vi.mock("@/app/[locale]/(protected)/organizations/components/organization-detail-view", () => ({
  OrganizationDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/organizations/components/organization-detail-summary", () => ({
  OrganizationDetailSummary: () => null,
}));
vi.mock("@/app/[locale]/(protected)/deals/components/deal-detail-view", () => ({
  DealDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/deals/components/deal-detail-summary", () => ({
  DealDetailSummary: () => null,
}));
vi.mock("@/app/[locale]/(protected)/services/components/service-detail-view", () => ({
  ServiceDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/services/components/service-detail-summary", () => ({
  ServiceDetailSummary: () => null,
}));
vi.mock("@/app/[locale]/(protected)/tasks/components/task-detail-view", () => ({
  TaskDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/tasks/components/task-detail-summary", () => ({
  TaskDetailSummary: () => null,
}));

import { ENTITY_DETAIL } from "../entity-detail.registry";

const t = (key: string) => `translated:${key}`;

describe("entity detail identity", () => {
  it.each([
    [EntityType.contact, {}, "Lead"],
    [EntityType.organization, {}, "Company"],
    [EntityType.deal, {}, "Job"],
    [EntityType.service, {}, "Package"],
    [EntityType.task, { type: "custom" }, "Follow-up"],
  ] as const)("uses the selected %s terminology for unnamed records", (entityType, entity, fallbackName) => {
    expect(ENTITY_DETAIL[entityType].identity(entity, t, fallbackName).name).toBe(fallbackName);
  });

  it("keeps canonical system-task names translated", () => {
    expect(ENTITY_DETAIL[EntityType.task].identity({ type: "userPendingAuthorization" }, t, "Follow-up").name).toBe(
      "translated:Common.systemTasks.userPendingAuthorization.title",
    );
  });
});

describe("entity detail personalization registry", () => {
  it("uses a distinct, internally valid preference configuration for every entity type", () => {
    const customColumns = [
      {
        id: "10000000-0000-4000-8000-000000000001",
        label: "Priority",
      },
    ] as never;
    const configurations = Object.values(EntityType).map((entityType) =>
      ENTITY_DETAIL[entityType].personalization?.(customColumns),
    );

    expect(configurations.every(Boolean)).toBe(true);
    expect(new Set(configurations.map((configuration) => configuration?.p13nId)).size).toBe(
      Object.values(EntityType).length,
    );

    for (const configuration of configurations) {
      expect(configuration?.defaultStarredFieldIds.every((id) => configuration.availableFieldIds?.includes(id))).toBe(
        true,
      );
      expect(
        (configuration?.defaultCollapsedSectionIds ?? []).every((id) => configuration?.sectionIds?.includes(id)),
      ).toBe(true);
      expect(configuration?.sectionIds).toEqual(["base", "relations", "customFields"]);
    }
  });

  it("removes inaccessible relation fields from defaults and stored-favorite reconciliation", () => {
    const contact = ENTITY_DETAIL[EntityType.contact].personalization?.(
      [],
      (resource) => resource !== Resource.organizations && resource !== Resource.users,
    );

    expect(contact?.availableFieldIds).not.toContain("organizationIds");
    expect(contact?.availableFieldIds).not.toContain("userIds");
    expect(contact?.defaultStarredFieldIds).not.toContain("organizationIds");
    expect(contact?.defaultStarredFieldIds).not.toContain("userIds");
    expect(contact?.availableFieldIds).toContain("identifiers");
  });
});
