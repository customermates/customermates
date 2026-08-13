import type { ComponentType } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuditLogsPageSkeleton } from "@/app/[locale]/(protected)/company/components/audit-log/audit-logs-page-skeleton";
import { RolesPageSkeleton } from "@/app/[locale]/(protected)/company/components/role/roles-page-skeleton";
import { MembersPageSkeleton } from "@/app/[locale]/(protected)/company/components/user/members-page-skeleton";
import { WebhookDeliveriesPageSkeleton } from "@/app/[locale]/(protected)/company/components/webhook/webhook-deliveries-page-skeleton";
import { WebhooksPageSkeleton } from "@/app/[locale]/(protected)/company/components/webhook/webhooks-page-skeleton";
import { ContactsPageSkeleton } from "@/app/[locale]/(protected)/contacts/components/contacts-page-skeleton";
import { DealsPageSkeleton } from "@/app/[locale]/(protected)/deals/components/deals-page-skeleton";
import { OrganizationsPageSkeleton } from "@/app/[locale]/(protected)/organizations/components/organizations-page-skeleton";
import { ServicesPageSkeleton } from "@/app/[locale]/(protected)/services/components/services-page-skeleton";
import { TasksPageSkeleton } from "@/app/[locale]/(protected)/tasks/components/tasks-page-skeleton";

import type { DataViewView } from "../data-view-state";

type Skeleton = ComponentType<{ animated?: boolean; view?: DataViewView }>;

const CASES: Array<[string, Skeleton, string, string]> = [
  ["contacts", ContactsPageSkeleton, "contact", "avatar"],
  ["organizations", OrganizationsPageSkeleton, "entity", "text"],
  ["deals", DealsPageSkeleton, "entity", "text"],
  ["services", ServicesPageSkeleton, "entity", "text"],
  ["tasks", TasksPageSkeleton, "entity", "text"],
  ["members", MembersPageSkeleton, "member", "avatar"],
  ["roles", RolesPageSkeleton, "plain", "text"],
  ["audit-logs", AuditLogsPageSkeleton, "plain", "text"],
  ["webhooks", WebhooksPageSkeleton, "plain", "text"],
  ["webhook-deliveries", WebhookDeliveriesPageSkeleton, "plain", "text"],
];

describe("feature-owned collection skeletons", () => {
  it.each(CASES)("binds %s to its table and card identity geometry", (name, SkeletonComponent, table, identity) => {
    const tableHtml = renderToStaticMarkup(createElement(SkeletonComponent));
    const cardsHtml = renderToStaticMarkup(createElement(SkeletonComponent, { view: "cards" }));
    const boardHtml = renderToStaticMarkup(createElement(SkeletonComponent, { view: "board" }));

    expect(tableHtml).toContain(`data-${name}-page-skeleton="true"`);
    expect(tableHtml).toContain('data-skeleton-view="table"');
    expect(tableHtml).toContain(`data-skeleton-variant="${table}"`);
    expect(cardsHtml).toContain('data-skeleton-view="cards"');
    expect(cardsHtml).toContain(`data-skeleton-variant="${identity}"`);
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
