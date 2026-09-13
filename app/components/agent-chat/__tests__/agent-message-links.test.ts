import type { AnchorHTMLAttributes } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  locale: "de",
  links: [] as AnchorHTMLAttributes<HTMLAnchorElement>[],
}));

vi.mock("next-intl", () => ({
  useLocale: () => state.locale,
  useTranslations: () => (key: string) => key,
}));
vi.mock("next-intl/navigation", async () => {
  const { createElement } = await import("react");
  return {
    createNavigation: () => ({
      usePathname: () => "/contacts",
      Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
        state.links.push(props);
        return createElement("a", { ...props, href: `/${state.locale}${props.href}` }, children);
      },
    }),
  };
});

import { MessageResponse } from "@/components/ai-elements/message";
import { dataViewNavigationHref, entityTimelineNavigationHref } from "@/core/data-view/data-view-links";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { DATA_VIEW_PATHS, ENTITY_TIMELINE_PARENT_PATHS } from "@/core/data-view/data-view-paths";
import { sanitizeAgentVisibleTextForApp } from "@/ee/agent-chat/agent-output-safety";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { agentMessageComponents, agentMessageRehypePlugins } from "../agent-message-links";

const viewId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000002";
const href = `/contacts?view=${viewId}`;
const timelineHref = `/contacts/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
function renderMessage(text: string) {
  return renderToStaticMarkup(
    createElement(
      MessageResponse,
      { mode: "static", components: agentMessageComponents, rehypePlugins: agentMessageRehypePlugins },
      text,
    ),
  );
}
beforeEach(() => {
  state.locale = "de";
  state.links = [];
});

describe("saved-view message links", () => {
  it("accepts only the shared standalone routes with an exact view key", () => {
    for (const path of Object.values(DATA_VIEW_PATHS)) {
      if (path === null) continue;
      for (const prefix of ["", ...APP_LOCALES.map((locale) => `/${locale}`)]) {
        for (const key of [viewId, "__all__"])
          expect(dataViewNavigationHref(`${prefix}${path}?view=${key}`)).toBe(`${path}?view=${key}`);
      }
    }
    for (const invalid of [
      `https://example.com${href}`,
      `//example.com${href}`,
      `/unknown?view=${viewId}`,
      `/xx${href}`,
      `${href}&searchTerm=x`,
      `${href}#details`,
      `${href}/details`,
      "/contacts?view=00000000-0000-4",
      `/contacts?record=${viewId}`,
      "/contacts",
    ])
      expect(dataViewNavigationHref(invalid), invalid).toBeNull();
  });

  it("accepts an embedded timeline only on an exact record route", () => {
    for (const path of ENTITY_TIMELINE_PARENT_PATHS) {
      const localized = `${path}/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
      for (const prefix of ["", ...APP_LOCALES.map((locale) => `/${locale}`)])
        expect(dataViewNavigationHref(`${prefix}${localized}`)).toBe(localized);
    }
    for (const invalid of [
      `/contacts/not-a-record?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`,
      `/contacts/${recordId}?view=not-a-view&viewSurface=${SURFACE.entityTimeline}`,
      `/contacts/${recordId}?view=${viewId}`,
      `/contacts/${recordId}?viewSurface=${SURFACE.entityTimeline}&view=${viewId}`,
      `/contacts/${recordId}?view=${viewId}&viewSurface=${SURFACE.contacts}`,
      `/contacts/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}&extra=value`,
      `/company/members/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`,
    ])
      expect(dataViewNavigationHref(invalid), invalid).toBeNull();
  });

  it("canonicalizes only same-origin absolute view links", () => {
    const origin = "https://app.example.com";

    expect(dataViewNavigationHref(`${origin}/en${timelineHref}`, { origin })).toBe(timelineHref);
    expect(dataViewNavigationHref(`https://example.invalid/en${timelineHref}`, { origin })).toBeNull();
    expect(dataViewNavigationHref(`${origin}/en${timelineHref}#activity`, { origin })).toBeNull();
  });

  it("builds a timeline link only from an exact record-detail page route", () => {
    expect(entityTimelineNavigationHref(`/en/contacts/${recordId}?view=__all__`, viewId)).toBe(timelineHref);
    expect(entityTimelineNavigationHref(`/contacts/${recordId}#activity`, viewId)).toBeNull();
    expect(entityTimelineNavigationHref("//example.com/contacts/record", viewId)).toBeNull();
    expect(entityTimelineNavigationHref("/contacts", viewId)).toBeNull();
    expect(entityTimelineNavigationHref(`/contacts/${recordId}`, "invalid")).toBeNull();
  });

  it("renders local views as locale-aware anchors and leaves other links behind the safety dialog", () => {
    const markup = renderMessage(
      `[My view](/en${href}) [Timeline](/en${timelineHref}) [External](https://example.com) [Other](/dashboard)`,
    );
    expect(markup).toContain(`href="/de${href}"`);
    expect(markup).toContain(`href="/de${timelineHref.replace("&", "&amp;")}"`);
    expect(markup).toMatch(/<a[^>]*>My view<\/a>/);
    expect(markup).toMatch(/<a[^>]*>Timeline<\/a>/);
    expect(markup).toMatch(/<button[^>]*data-streamdown="link"[^>]*>External<\/button>/);
    expect(markup).toMatch(/<button[^>]*data-streamdown="link"[^>]*>Other<\/button>/);
    expect(state.links).toHaveLength(2);
  });

  it("renders a sanitized embedded timeline response as a named link", () => {
    const markup = renderMessage(
      sanitizeAgentVisibleTextForApp(
        `Created [Activity timeline](http://localhost:4016/en${timelineHref}).`,
        "http://localhost:4016",
      ),
    );
    expect(markup).toMatch(/<a[^>]*>Activity timeline<\/a>/);
    expect(markup).toContain(`href="/de${timelineHref.replace("&", "&amp;")}"`);
    expect(markup).not.toContain("[internal reference]");
  });
});
