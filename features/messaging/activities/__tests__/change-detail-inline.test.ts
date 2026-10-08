import type { ReactNode } from "react";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DomainEvent } from "@/features/event/domain-events";

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
vi.mock("@/components/records/use-record-href", () => ({
  usePresetRecordHref: () => () => undefined,
  useOpenPresetRecord: () => vi.fn(),
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
vi.mock("@/app/[locale]/(protected)/records/[typeId]/components/record-value", () => ({
  EmptyValue: () => "—",
  RecordValue: ({ result }: { result: { state: string; value?: { text?: string; value?: unknown } } }) =>
    result.state === "value" ? String(result.value?.text ?? result.value?.value ?? "rich") : result.state,
}));
vi.mock("@/components/shared/avatar-stack", () => ({
  AvatarStack: ({ items }: { items: Array<{ firstName: string }> }) => items.map((item) => item.firstName).join(","),
}));
vi.mock("@/components/chip/app-chip-stack", () => ({
  AppChipStack: ({ items, variant }: { items: Array<{ label: string }>; variant?: string }) =>
    `${variant ?? "default"}:${items.map((item) => item.label).join(",")}`,
}));
vi.mock("@/components/card/app-card", () => ({ AppCard: passthrough }));
vi.mock("@/components/card/app-card-body", () => ({ AppCardBody: passthrough }));

const { AuditDetail } = await import("../audit-detail");
const { RecordAuditDetail } = await import("../record-audit-detail");

const ARROW = "lucide-arrow-right";
const BASE = {
  id: "entry-1",
  at: new Date("2026-10-06T10:00:00Z"),
  actor: { firstName: "Max", lastName: "Example", avatarUrl: null, email: "max@example.test" },
  records: { primary: null, related: [], relatedOverflow: 0 },
};

function text(fieldId: string, value: string) {
  return {
    fieldId,
    label: "Name",
    valueType: "text",
    format: null,
    options: [],
    value: { state: "value", value: { kind: "text", text: value } },
  };
}

function richText(fieldId: string, text: string | null) {
  const value =
    text === null
      ? { state: "restricted" }
      : {
          state: "value",
          value: {
            kind: "richText",
            documentJson: JSON.stringify({
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text }] }],
            }),
          },
        };
  return { fieldId, label: "Notes", valueType: "richText", format: null, options: [], value };
}

function renderRecord(fields: unknown[]) {
  const entry = {
    ...BASE,
    kind: "record",
    event: "record.updated",
    changes: {
      ref: { typeId: "type-1", recordId: "record-1" },
      fields,
      assignments: null,
      identities: null,
      links: [],
      related: [],
    },
    members: [],
    lists: {},
  } as unknown as Extract<ActivityEntryDto, { kind: "record" }>;
  return renderToStaticMarkup(createElement(RecordAuditDetail, { entry }));
}

describe("change detail", () => {
  it("shows a record field change as previous → current on one line, without value cards", () => {
    const entry = {
      ...BASE,
      kind: "record",
      event: "record.updated",
      changes: {
        ref: { typeId: "type-1", recordId: "record-1" },
        fields: [{ fieldId: "field-1", before: text("field-1", "Old name"), after: text("field-1", "New name") }],
        assignments: { before: [], after: ["user-1"] },
        identities: null,
        links: [],
        related: [
          {
            label: "Deals",
            before: [],
            after: [{ ref: { typeId: "type-deals", recordId: "deal-1" }, title: "Renewal" }],
          },
        ],
      },
      members: [{ id: "user-1", firstName: "Ada", lastName: "Lovelace", avatarUrl: null }],
      lists: { "type-deals": { icon: "handshake", color: "info" } },
    } as unknown as Extract<ActivityEntryDto, { kind: "record" }>;
    const markup = renderToStaticMarkup(createElement(RecordAuditDetail, { entry }));

    expect(markup).toMatch(new RegExp(`Name.*Old name.*${ARROW}.*New name`));
    expect(markup).toMatch(new RegExp(`RecordModel.assignedTo.*—.*${ARROW}.*Ada`));
    expect(markup).toMatch(new RegExp(`Deals.*—.*${ARROW}.*info:Renewal`));
    expect(markup).not.toContain("RecordModel.previousValue");
    expect(markup).not.toContain("rounded-md border p-3");
  });

  it("shows an admin creation as no value → current and a deletion as previous → no value", () => {
    const render = (event: DomainEvent) =>
      renderToStaticMarkup(
        createElement(AuditDetail, {
          entry: {
            ...BASE,
            kind: "audit",
            event,
            changes: [{ field: "url", snapshot: true, previous: undefined, current: "https://receiver.example" }],
          },
        }),
      );

    expect(render(DomainEvent.WEBHOOK_CREATED)).toMatch(new RegExp(`—.*${ARROW}.*https://receiver.example`));
    expect(render(DomainEvent.WEBHOOK_DELETED)).toMatch(new RegExp(`https://receiver.example.*${ARROW}.*—`));
  });

  it("shows a record access change per type and role as previous → current", () => {
    const markup = renderToStaticMarkup(
      createElement(AuditDetail, {
        entry: {
          ...BASE,
          kind: "configuration",
          event: "record_grants.updated",
          changes: [{ field: "grants", label: "Contacts · Auditors", previous: ["readAll"], current: ["update"] }],
        },
      }),
    );

    expect(markup).toMatch(
      new RegExp(`Contacts · Auditors.*RoleModal.readAccess: RoleModal.readAll.*${ARROW}.*RoleModal.edit`),
    );
  });

  it("keeps a snapshot of an event that is neither a creation nor a deletion as a plain value", () => {
    const markup = renderToStaticMarkup(
      createElement(AuditDetail, {
        entry: {
          ...BASE,
          kind: "audit",
          event: DomainEvent.RECORDS_EXPORTED,
          changes: [{ field: "count", snapshot: true, previous: undefined, current: 42 }],
        },
      }),
    );

    expect(markup).toContain("42");
    expect(markup).not.toContain(ARROW);
    expect(markup).not.toContain("—");
  });

  it("diffs rich text by line, skips a change without a visible difference and falls back for restricted values", () => {
    const diff = renderRecord([
      { fieldId: "notes-1", before: richText("notes-1", "Old notes"), after: richText("notes-1", "New notes") },
    ]);
    expect(diff).toContain("Old notes");
    expect(diff).toContain("New notes");
    expect(diff).toContain("bg-success/10");

    const unchanged = renderRecord([
      { fieldId: "notes-1", before: richText("notes-1", "Same"), after: richText("notes-1", "Same") },
    ]);
    expect(unchanged).not.toContain("Notes");

    const restricted = renderRecord([
      { fieldId: "notes-1", before: richText("notes-1", null), after: richText("notes-1", "Visible") },
    ]);
    expect(restricted).toMatch(new RegExp(`restricted.*${ARROW}.*Visible`));
    expect(restricted).not.toContain("bg-success/10");
  });
});
