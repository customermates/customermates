import type { ActivityEntryDto, ActivitySubjectDto } from "@/ee/messaging/activities/activities.schema";
import type { AuditChange } from "@/features/event/audit-changes";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DomainEvent } from "@/features/event/domain-events";

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => Object.assign((key: string) => key, { has: () => false, raw: () => undefined }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ userModalStore: { loadById: vi.fn() }, timelineDetailModalStore: { openWith: vi.fn() } }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: () => "date", formatRelativeTime: () => "now" }),
}));
vi.mock("@/components/data-view/use-column-label", () => ({
  useCanonicalColumnLabel: () => (field: string) => field,
}));
vi.mock("@/components/ui/avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/chip/app-chip-stack", () => ({
  AppChipStack: ({ items }: { items: Array<{ label: string }> }) =>
    `member-chips:${items.map((item) => item.label).join(",")}`,
}));

const { ActivitiesList } = await import("../activities-list");
const { AuditDetail } = await import("../audit-detail");

const ACTOR = { firstName: "Olivia", lastName: "Owner", avatarUrl: null, email: "owner@example.test" };
const NO_RECORDS = { primary: null, related: [], relatedOverflow: 0 };
const MEMBER: ActivitySubjectDto = {
  kind: "user",
  member: { id: "00000000-0000-4000-8000-000000000001", firstName: "Invited", lastName: "Member", avatarUrl: null },
};
const STATUS: AuditChange[] = [{ field: "status", previous: "inactive", current: "active" }];

function audit(
  event: DomainEvent,
  subject: ActivitySubjectDto | null,
  changes: AuditChange[] = STATUS,
): Extract<ActivityEntryDto, { kind: "audit" }> {
  return {
    kind: "audit",
    id: event,
    at: new Date("2026-10-14T10:00:00Z"),
    actor: ACTOR,
    event,
    changes,
    subject,
    records: NO_RECORDS,
  };
}

function renderRows(items: ActivityEntryDto[]) {
  return renderToStaticMarkup(
    createElement(ActivitiesList, { items, hasMore: false, loading: false, onLoadOlder: () => undefined }),
  );
}

function rowSubtitle(markup: string, index = 0) {
  return [...markup.matchAll(/<p class="text-muted-foreground mt-0\.5[^"]*">(.*?)<\/p>/g)][index]?.[1] ?? "";
}

describe("workspace activity subjects", () => {
  it("names the changed member in the row next to the changed fields, with the admin as the actor", () => {
    const markup = renderRows([audit(DomainEvent.USER_UPDATED, MEMBER)]);

    expect(markup).toContain(">Olivia Owner</h3>");
    expect(rowSubtitle(markup)).toBe(
      '<span class="font-medium">Invited Member</span><span aria-hidden="true"> · </span>status',
    );
  });

  it("names roles from their stored label and a member without a known name neutrally", () => {
    const markup = renderRows([
      audit(DomainEvent.ROLE_UPDATED, { kind: "role", id: "role-1", label: "Field team" }, [
        { field: "description", previous: null, current: "Visits customers" },
      ]),
      audit(DomainEvent.USER_UPDATED, {
        kind: "user",
        member: { id: "00000000-0000-4000-8000-000000000002", firstName: "", lastName: "", avatarUrl: null },
      }),
      audit(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, null, []),
    ]);

    expect(rowSubtitle(markup, 0)).toContain('<span class="font-medium">Field team</span>');
    expect(rowSubtitle(markup, 1)).toContain('<span class="font-medium">RecordModel.member</span>');
    expect(rowSubtitle(markup, 2)).toBe(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED);
  });

  it("keeps the record label as the subject of a record change through the same row", () => {
    const record = {
      kind: "record",
      id: "record-entry",
      at: new Date("2026-10-14T10:00:00Z"),
      actor: ACTOR,
      event: "record.updated",
      changes: {
        ref: { typeId: "type-1", recordId: "record-1" },
        fields: [{ fieldId: "field-1", before: null, after: { label: "Name" } }],
        assignments: null,
        identities: null,
        links: [],
        related: [],
      },
      members: [],
      lists: {},
      records: {
        primary: { ref: { typeId: "type-1", recordId: "record-1" }, label: "Acme", avatarUrl: null, icon: "building" },
        related: [],
        relatedOverflow: 0,
      },
    } as unknown as ActivityEntryDto;

    expect(rowSubtitle(renderRows([record]))).toBe(
      '<span class="font-medium">Acme</span><span aria-hidden="true"> · </span>Name',
    );
  });

  it("shows the changed member as an avatar chip and a role as a chip in the details header", () => {
    const member = renderToStaticMarkup(createElement(AuditDetail, { entry: audit(DomainEvent.USER_UPDATED, MEMBER) }));
    expect(member).toContain("Olivia Owner");
    expect(member).toMatch(/User Updated|user\.updated/);
    expect(member).toContain("member-chips:Invited Member");

    const role = renderToStaticMarkup(
      createElement(AuditDetail, {
        entry: audit(DomainEvent.ROLE_DELETED, { kind: "role", id: "role-1", label: "Retired role" }, []),
      }),
    );
    expect(role).toMatch(/data-slot="badge"[^>]*>(?:(?!<\/span>).)*Retired role/);
    expect(role).not.toContain("member-chips:");
  });
});
