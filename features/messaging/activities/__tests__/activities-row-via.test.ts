import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    key === "EntityTimeline.viaCredential"
      ? messages.EntityTimeline.viaCredential.replace("{name}", values?.name ?? "")
      : key,
}));

import { DetailHeader, TimelineRow, useActorViaLabel } from "../activities-row";

const ROW = { avatar: null, subtitle: "Name", time: "now", isFirst: true, isLast: true } as const;

describe("who an activity came through", () => {
  it("names the credential after the person in a timeline row and a detail header", () => {
    const row = renderToStaticMarkup(
      createElement(TimelineRow, { ...ROW, title: "Max Bergmann", titleSuffix: "via Claude Desktop" }),
    );
    const header = renderToStaticMarkup(
      createElement(DetailHeader, { avatar: null, title: "Max Bergmann", titleSuffix: "via ChatGPT", subtitle: "x" }),
    );

    expect(row).toContain("Max Bergmann");
    expect(row.replace(/<[^>]+>/g, "")).toContain("Max Bergmann via Claude Desktop");
    expect(header.replace(/<[^>]+>/g, "")).toContain("Max Bergmann via ChatGPT");
  });

  it("shows nothing next to a person who worked in the app", () => {
    const row = renderToStaticMarkup(createElement(TimelineRow, { ...ROW, title: "Max Bergmann" }));

    expect(row.replace(/<[^>]+>/g, "")).not.toContain("via");
  });

  it("builds the label from the name of the API key or application", () => {
    let label: ReturnType<typeof useActorViaLabel> | undefined;
    renderToStaticMarkup(
      createElement(() => {
        label = useActorViaLabel();
        return null;
      }),
    );

    expect(label?.({ via: { name: "Codex CLI" } })).toBe("via Codex CLI");
    expect(label?.({})).toBeUndefined();
  });
});
