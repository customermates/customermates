import type { ReactNode } from "react";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";
import type { AuditChange } from "@/features/event/audit-changes";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DomainEvent } from "@/features/event/domain-events";
import { WIKI_PAGE_KINDS } from "@/features/wiki/wiki.schema";

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
vi.mock("@/components/data-view/use-column-label", () => ({
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

import { AuditDetail } from "../audit-detail";

function renderDetail(changes: AuditChange[], event: DomainEvent = DomainEvent.WIKI_PAGE_UPDATED): string {
  const entry: Extract<ActivityEntryDto, { kind: "audit" }> = {
    kind: "audit",
    id: "wiki-audit-1",
    at: new Date("2026-09-29T10:00:00Z"),
    actor: { firstName: "Max", lastName: "Example", avatarUrl: null, email: "max@example.test" },
    event,
    changes,
    records: { primary: null, related: [], relatedOverflow: 0 },
  };
  return renderToStaticMarkup(createElement(AuditDetail, { entry }));
}

describe("Wiki activity detail", () => {
  it.each(WIKI_PAGE_KINDS)("uses the shared %s page-type label in creation and deletion snapshots", (kind) => {
    for (const event of [DomainEvent.WIKI_PAGE_CREATED, DomainEvent.WIKI_PAGE_DELETED]) {
      const markup = renderDetail([{ field: "kind", snapshot: true, previous: undefined, current: kind }], event);
      expect(markup).toContain("Wiki.kind.label");
      expect(markup).toContain(`Wiki.kind.${kind}`);
    }
  });

  it("translates both page types and the procedure trigger field on an update", () => {
    const markup = renderDetail([
      { field: "kind", previous: "knowledge", current: "procedure" },
      { field: "whenToUse", previous: "", current: "When a customer asks to cancel" },
    ]);

    expect(markup).toContain("Wiki.kind.label");
    expect(markup).toContain("Wiki.kind.knowledge");
    expect(markup).toContain("Wiki.kind.procedure");
    expect(markup).toContain("Wiki.whenToUse.label");
    expect(markup).toContain("When a customer asks to cancel");
    expect(markup).toContain('data-empty-value=""');
    expect(markup).not.toContain("—");
  });

  it("preserves the normal field/value contract for a non-Wiki event", () => {
    const markup = renderDetail([{ field: "kind", previous: "knowledge", current: "guide" }], DomainEvent.ROLE_UPDATED);

    expect(markup).toContain("knowledge");
    expect(markup).toContain("guide");
    expect(markup).not.toContain("Wiki.kind.");
  });

  it.each([DomainEvent.WIKI_PAGE_CREATED, DomainEvent.WIKI_PAGE_DELETED])(
    "renders readable Markdown for %s without inventing a diff or a page link",
    (event) => {
      const markup = renderDetail(
        [
          { field: "title", snapshot: true, previous: undefined, current: "Customer guide" },
          {
            field: "markdown",
            snapshot: true,
            previous: undefined,
            current: "## Customer guidance\n\nRead **these rules**.",
          },
        ],
        event,
      );

      expect(markup).toContain("Customer guide");
      expect(markup).toContain("<h2>Customer guidance</h2>");
      expect(markup).toContain("<strong>these rules</strong>");
      expect(markup).not.toContain("bg-success/10");
      expect(markup).not.toContain('href="/wiki');
    },
  );

  it("renders the shared Markdown diff without raw Markdown markup", () => {
    const markup = renderDetail([
      {
        field: "markdown",
        previous: "## Previous guidance\n\nOld process",
        current: "## Current guidance\n\nNew process",
      },
    ]);

    expect(markup).toContain("Previous guidance");
    expect(markup).toContain("Current guidance");
    expect(markup).toContain("bg-success/10");
    expect(markup).toContain("bg-destructive/10");
    expect(markup).not.toContain("## Previous");
  });

  it("suppresses unchanged Markdown while retaining an actual title change", () => {
    const markup = renderDetail([
      { field: "title", previous: "Old title", current: "New title" },
      { field: "markdown", previous: "## Same guidance", current: "## Same guidance" },
    ]);

    expect(markup).toContain("Old title");
    expect(markup).toContain("New title");
    expect(markup).not.toContain("Same guidance");
    expect(markup).not.toContain("bg-success/10");
  });

  it("shows the established empty detail when Markdown has no visible change", () => {
    const markup = renderDetail([{ field: "markdown", previous: "", current: "\n\n" }]);

    expect(markup).toContain("EntityTimeline.noFurtherDetail");
  });
});
