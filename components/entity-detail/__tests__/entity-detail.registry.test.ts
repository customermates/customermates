import { describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

vi.mock("@/app/[locale]/(protected)/contacts/components/contact-detail-view", () => ({
  ContactDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/organizations/components/organization-detail-view", () => ({
  OrganizationDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/deals/components/deal-detail-view", () => ({
  DealDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/services/components/service-detail-view", () => ({
  ServiceDetailView: () => null,
}));
vi.mock("@/app/[locale]/(protected)/tasks/components/task-detail-view", () => ({
  TaskDetailView: () => null,
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
