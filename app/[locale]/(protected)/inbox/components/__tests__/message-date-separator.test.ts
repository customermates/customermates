import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const intlStore = {
  rendersZonedValues: false,
  formatDescriptiveShortDate: (date: Date) => `short:${date.toISOString().slice(0, 10)}`,
};

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ intlStore }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => intlStore,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { MessageDateSeparator, isSameDay, resolveSeparatorLabel } from "../message-date-separator";

function render(date: Date) {
  return renderToStaticMarkup(createElement(MessageDateSeparator, { date }));
}

function stripText(html: string) {
  return html.replace(/>[^<>]*</g, "><");
}

describe("resolveSeparatorLabel", () => {
  const t = (key: string) => key;
  const now = new Date(2026, 7, 20, 12, 0, 0);

  it("labels the current day as today", () => {
    expect(resolveSeparatorLabel(new Date(2026, 7, 20, 8, 0, 0), now, t, intlStore)).toBe("Inbox.dateToday");
  });

  it("labels the previous day as yesterday", () => {
    expect(resolveSeparatorLabel(new Date(2026, 7, 19, 8, 0, 0), now, t, intlStore)).toBe("Inbox.dateYesterday");
  });

  it("falls back to an absolute date for anything older", () => {
    expect(resolveSeparatorLabel(new Date(2026, 7, 1, 8, 0, 0), now, t, intlStore)).toMatch(/^short:/);
  });

  it("crosses a month boundary when yesterday was the previous month", () => {
    const firstOfMonth = new Date(2026, 7, 1, 12, 0, 0);
    expect(resolveSeparatorLabel(new Date(2026, 6, 31, 8, 0, 0), firstOfMonth, t, intlStore)).toBe(
      "Inbox.dateYesterday",
    );
  });
});

describe("MessageDateSeparator hydration safety", () => {
  it("renders no clock- or timezone-dependent text before the client has hydrated", () => {
    intlStore.rendersZonedValues = false;

    const html = render(new Date(2026, 7, 20, 8, 0, 0));

    expect(html).not.toContain("Inbox.dateToday");
    expect(html).not.toContain("Inbox.dateYesterday");
    expect(html).not.toContain("short:");
  });

  it("keeps the same element shape once hydrated, so hydration only fills in the label", () => {
    intlStore.rendersZonedValues = false;
    const serverHtml = render(new Date(2026, 7, 1, 8, 0, 0));

    intlStore.rendersZonedValues = true;
    const clientHtml = render(new Date(2026, 7, 1, 8, 0, 0));
    intlStore.rendersZonedValues = false;

    expect(clientHtml).toContain("short:");
    expect(stripText(serverHtml)).toBe(stripText(clientHtml));
  });
});

describe("isSameDay", () => {
  it("compares calendar days rather than absolute time", () => {
    expect(isSameDay(new Date(2026, 7, 20, 0, 30), new Date(2026, 7, 20, 23, 30))).toBe(true);
    expect(isSameDay(new Date(2026, 7, 20, 23, 30), new Date(2026, 7, 21, 0, 30))).toBe(false);
  });
});
