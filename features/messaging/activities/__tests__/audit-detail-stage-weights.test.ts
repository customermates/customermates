import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const { passthrough } = vi.hoisted(() => ({
  passthrough: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ userModalStore: {} }) }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: () => "date" }),
}));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useEntityHref: () => () => undefined,
  useOpenEntity: () => vi.fn(),
}));
vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useCanonicalColumnLabel: () => (field: string) => field,
}));
vi.mock("../activities-row", () => ({
  auditCategory: () => ({ icon: () => null, tone: "neutral" }),
  DetailHeader: () => null,
  IdentityAvatar: () => null,
  TypeBadge: () => null,
}));
vi.mock("@/components/card/app-card", () => ({ AppCard: passthrough }));
vi.mock("@/components/card/app-card-body", () => ({ AppCardBody: passthrough }));
vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children, endContent }: { children?: ReactNode; endContent?: ReactNode }) =>
    createElement("span", { "data-chip": "" }, children, endContent),
}));

import { AuditDetail } from "../audit-detail";

const OPEN = "10000000-0000-4000-8000-000000000011";
const PARKED = "10000000-0000-4000-8000-000000000012";

describe("AuditDetail deal stage weights", () => {
  it("shows the probability only for stages that carry a weight", () => {
    const markup = renderToStaticMarkup(
      createElement(AuditDetail, {
        customColumns: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            entityType: EntityType.deal,
            label: "Stage",
            type: CustomColumnType.singleSelect,
            options: {
              options: [
                { value: OPEN, label: "Open", color: "warning", isDefault: true, index: 0, weight: 30 },
                { value: PARKED, label: "Parked", color: "secondary", isDefault: false, index: 1 },
              ],
            },
          },
        ],
        entry: {
          kind: "audit",
          id: "audit-1",
          at: new Date("2026-09-25T10:00:00Z"),
          actor: { id: "user-1", firstName: "Max", lastName: "Example", avatarUrl: null },
          event: "company.updated",
          changes: [
            {
              field: "dealStageWeights",
              snapshot: true,
              current: [{ optionValue: OPEN, weight: 40 }, { optionValue: PARKED }],
            },
          ],
          records: [],
        } as never,
      }),
    );

    expect(markup).toContain("Open");
    expect(markup).toContain("40%");
    expect(markup).toContain("Parked");
    expect(markup).not.toContain("undefined%");
    expect(markup.match(/%/g)).toHaveLength(1);
  });
});
