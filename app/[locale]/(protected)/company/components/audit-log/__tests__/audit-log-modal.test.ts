import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainEvent } from "@/features/event/domain-events";

const harness = vi.hoisted(() => ({ form: {} as Record<string, unknown> }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ auditLogModalStore: harness, userModalStore: {} }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: () => "September 13" }),
}));
vi.mock("@/components/modal/app-modal", () => ({
  AppModal: ({ children }: { children: ReactNode }) => createElement("div", { role: "dialog" }, children),
}));
vi.mock("@/components/shared/avatar-stack", () => ({ AvatarStack: () => null }));
vi.mock("@/components/chip/copyable-chip", () => ({
  CopyableChip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/components/shared/code-block-accordion", () => ({
  CodeBlockAccordion: () => null,
}));

import { AuditLogModal } from "../audit-log-modal";

beforeEach(() => {
  harness.form = {
    event: DomainEvent.WIKI_PAGE_UPDATED,
    entityId: "10000000-0000-4000-8000-000000000001",
    eventData: {
      payload: {
        wikiPage: { title: "Customer guide" },
        changes: {
          markdown: {
            previous:
              "## Previous guidance\n\nA long paragraph about the old process that needs to remain fully readable.",
            current:
              "## Current guidance\n\nA long paragraph about the new process that needs to remain fully readable.",
          },
        },
      },
    },
  };
});

describe("Wiki Markdown audit presentation", () => {
  it("renders the real Markdown diff in its own wrapping block, not the compact truncating InfoRow", () => {
    const markup = renderToStaticMarkup(createElement(AuditLogModal));
    const section = markup.match(/<section aria-label="AuditLogModal.fields.markdown"[^>]*>[\s\S]*?<\/section>/)?.[0];

    expect(section).toBeDefined();
    expect(section).toContain("whitespace-normal");
    expect(section).toContain("text-left");
    expect(section).not.toContain("truncate");
    expect(section).toContain("Previous guidance");
    expect(section).toContain("Current guidance");
    expect(section).toContain("A long paragraph about the old process that needs to remain fully readable.");
    expect(section).toContain("A long paragraph about the new process that needs to remain fully readable.");
  });

  it("does not add a Wiki diff section for other audit events", () => {
    harness.form.event = DomainEvent.COMPANY_UPDATED;

    expect(renderToStaticMarkup(createElement(AuditLogModal))).not.toContain(
      '<section aria-label="AuditLogModal.fields.markdown"',
    );
  });
});
