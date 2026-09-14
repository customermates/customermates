import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { EntityType } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({
  activitiesInvoke: vi.fn(),
  entityInvoke: vi.fn(),
  getOptionalP13n: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("@/components/entity-detail/entity-detail-page-view", () => ({ EntityDetailPageView: () => null }));
vi.mock("@/core/di", () => ({
  getGetActivitiesInteractor: () => ({ invoke: mocks.activitiesInvoke }),
  getGetContactByIdInteractor: () => ({ invoke: mocks.entityInvoke }),
  getGetDealByIdInteractor: () => ({ invoke: mocks.entityInvoke }),
  getGetOrganizationByIdInteractor: () => ({ invoke: mocks.entityInvoke }),
  getGetServiceByIdInteractor: () => ({ invoke: mocks.entityInvoke }),
  getGetTaskByIdInteractor: () => ({ invoke: mocks.entityInvoke }),
}));
vi.mock("@/features/auth/next/require", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("@/features/p13n/next/get-optional-p13n", () => ({ getOptionalP13n: mocks.getOptionalP13n }));

type DetailPage = (props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<unknown>;

const pages: Array<{ entityType: EntityType; load: () => Promise<{ default: DetailPage }> }> = [
  { entityType: EntityType.contact, load: () => import("../contacts/[id]/page") },
  { entityType: EntityType.organization, load: () => import("../organizations/[id]/page") },
  { entityType: EntityType.deal, load: () => import("../deals/[id]/page") },
  { entityType: EntityType.service, load: () => import("../services/[id]/page") },
  { entityType: EntityType.task, load: () => import("../tasks/[id]/page") },
];

describe("record timeline view links", () => {
  beforeEach(() => {
    mocks.activitiesInvoke.mockReset().mockResolvedValue({ ok: false });
    mocks.entityInvoke.mockReset().mockResolvedValue({ ok: false });
    mocks.getOptionalP13n.mockReset().mockResolvedValue(null);
    mocks.requireAccess.mockReset().mockResolvedValue(undefined);
  });

  it.each(pages)("loads the linked timeline view for $entityType detail pages", async ({ entityType, load }) => {
    const id = "00000000-0000-4000-8000-000000000001";
    const viewId = "00000000-0000-4000-8000-000000000002";
    const page = (await load()).default;

    await page({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ view: viewId, viewSurface: SURFACE.entityTimeline }),
    });

    expect(mocks.activitiesInvoke).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        p13nId: SURFACE.entityTimeline,
        viewId,
        scope: { records: [{ entityType, ids: [id] }] },
        pagination: { page: 1, pageSize: 25 },
      }),
    );
  });

  it("loads All explicitly instead of falling back to the remembered timeline view", async () => {
    const page = (await import("../contacts/[id]/page")).default;

    await page({
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
      searchParams: Promise.resolve({ view: ALL_VIEW_KEY, viewSurface: SURFACE.entityTimeline }),
    });

    expect(mocks.activitiesInvoke).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ p13nId: SURFACE.entityTimeline, viewId: ALL_VIEW_KEY }),
    );
  });
});
