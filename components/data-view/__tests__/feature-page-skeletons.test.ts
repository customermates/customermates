import type { ComponentType } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RolesPageSkeleton } from "@/app/[locale]/(protected)/company/components/role/roles-page-skeleton";
import { MembersPageSkeleton } from "@/app/[locale]/(protected)/company/components/user/members-page-skeleton";
import { WebhookDeliveriesPageSkeleton } from "@/app/[locale]/(protected)/company/components/webhook/webhook-deliveries-page-skeleton";
import { WebhooksPageSkeleton } from "@/app/[locale]/(protected)/company/components/webhook/webhooks-page-skeleton";
import { RoutinesPageSkeleton } from "@/app/[locale]/(protected)/routines/components/routines-page-skeleton";

import { RecordsPageSkeleton } from "@/app/[locale]/(protected)/records/[typeId]/components/records-page-skeleton";
import type { DataViewView } from "../data-view-state";

type Skeleton = ComponentType<{ animated?: boolean; view?: DataViewView }>;

const CASES: Array<[string, Skeleton, string, string]> = [
  ["records", RecordsPageSkeleton, "entity", "text"],
  ["members", MembersPageSkeleton, "member", "avatar"],
  ["roles", RolesPageSkeleton, "plain", "text"],
  ["webhooks", WebhooksPageSkeleton, "plain", "text"],
  ["webhook-deliveries", WebhookDeliveriesPageSkeleton, "plain", "text"],
  ["routines", RoutinesPageSkeleton, "plain", "text"],
];

describe("feature-owned collection skeletons", () => {
  it.each(CASES)("binds %s to its table and board identity geometry", (name, SkeletonComponent, table, identity) => {
    const tableHtml = renderToStaticMarkup(createElement(SkeletonComponent));
    const boardHtml = renderToStaticMarkup(createElement(SkeletonComponent, { view: "board" }));

    expect(tableHtml).toContain(`data-${name}-page-skeleton="true"`);
    expect(tableHtml).toContain('data-skeleton-view="table"');
    expect(tableHtml).toContain(`data-skeleton-variant="${table}"`);
    expect(boardHtml).toContain('data-skeleton-view="board"');
    expect(boardHtml).toContain(`data-skeleton-variant="${identity}"`);
  });

  it.each(CASES)("keeps the %s empty background static", (_name, SkeletonComponent) => {
    const html = renderToStaticMarkup(createElement(SkeletonComponent, { animated: false }));

    expect(html).toContain('data-page-skeleton-empty="true"');
    expect(html).not.toContain("data-page-skeleton-loading");
    expect(html).not.toContain("animate-pulse");
  });
});
