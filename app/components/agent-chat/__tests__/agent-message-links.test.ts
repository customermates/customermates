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
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: { enabled: true, isOpen: true }, agentUiControlStore: { active: null } }),
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
import {
  AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS,
  OPERATOR_DATA_VIEW_SURFACE_KEYS,
} from "@/core/data-view/ai-manageable-surfaces";
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
    for (const surfaceKey of AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS) {
      const path = DATA_VIEW_PATHS[surfaceKey];
      if (path === null) continue;
      for (const prefix of ["", ...APP_LOCALES.map((locale) => `/${locale}`)]) {
        for (const key of [viewId, "__all__"])
          expect(dataViewNavigationHref(`${prefix}${path}?view=${key}`)).toBe(`${path}?view=${key}`);
      }
    }
    for (const surfaceKey of OPERATOR_DATA_VIEW_SURFACE_KEYS) {
      const path = DATA_VIEW_PATHS[surfaceKey];
      expect(path).not.toBeNull();
      expect(dataViewNavigationHref(`${path}?view=${viewId}`)).toBeNull();
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

  it("renders local views and other app routes as locale-aware anchors and external links behind the confirmation", () => {
    const markup = renderMessage(
      `[My view](/en${href}) [Timeline](/en${timelineHref}) [External](https://example.com) [Other](/dashboard)`,
    );
    expect(markup).toContain(`href="/de${href}"`);
    expect(markup).toContain(`href="/de${timelineHref.replaceAll("&", "&amp;")}"`);
    expect(markup).toMatch(/<a[^>]*>My view<\/a>/);
    expect(markup).toMatch(/<a[^>]*>Timeline<\/a>/);
    expect(markup).toMatch(/<a[^>]*target="_blank"[^>]*>External<\/a>/);
    expect(markup).toContain('href="/de/dashboard"');
    expect(markup).not.toContain('data-streamdown="link"');
    expect(state.links.map((link) => link.href)).toEqual([href, timelineHref, "/dashboard"]);
  });

  it("renders sanitized model-authored view link labels as clean inert text", () => {
    const text = sanitizeAgentVisibleTextForApp(
      `Created [Activity timeline](http://localhost:4016/en${timelineHref}). You can view [Contacts with Deals](${href}).`,
      "http://localhost:4016",
    );
    const markup = renderMessage(text);

    expect(text).toBe("Created Activity timeline. You can view Contacts with Deals.");
    expect(markup).not.toContain("<a");
    expect(markup).toContain("Created Activity timeline. You can view Contacts with Deals.");
    expect(markup).not.toContain("[Contacts with Deals]");
    expect(markup).not.toContain("[internal reference]");
    expect(markup).not.toContain(recordId);
    expect(markup).not.toContain(viewId);
    expect(state.links).toHaveLength(0);
  });

  it("renders an already-redacted persisted saved-view link as a clean inert label", () => {
    const text = sanitizeAgentVisibleTextForApp(
      "You can view the new list here: [Contacts with Deals](/contacts?view=[internal reference]).",
      "http://localhost:4016",
    );
    const markup = renderMessage(text);

    expect(text).toBe("You can view the new list here: Contacts with Deals.");
    expect(markup).toContain("You can view the new list here: Contacts with Deals.");
    expect(markup).not.toContain("<a");
    expect(markup).not.toContain("href=");
    expect(markup).not.toContain("[Contacts with Deals]");
    expect(state.links).toHaveLength(0);
  });

  it("keeps bare, autolink, and reference-style All-view destinations inert after sanitization", () => {
    const origin = "http://localhost:4016";
    const text = sanitizeAgentVisibleTextForApp(
      `Bare /contacts?view=__all__. Auto <${origin}/en/contacts?view=__all__>. Ref [All][v].\n\n[v]: /contacts?view=__all__`,
      origin,
    );
    const markup = renderMessage(text);

    expect(markup).not.toContain("<a");
    expect(markup).not.toContain("href=");
    expect(markup).toContain("All");
    expect(markup).toContain("[internal reference]");
    expect(state.links).toHaveLength(0);
  });

  it("renders exact bare saved-view and timeline URLs as localized links without exposing ids", () => {
    const markup = renderMessage(`Created ${href}. Localized /fr${href}, Activity: ${timelineHref}`);

    expect(markup).toContain(`href="/de${href}"`);
    expect(markup).toContain(`href="/de${timelineHref.replaceAll("&", "&amp;")}"`);
    expect(markup.match(/>AgentChat\.openSavedView<\/a>/g)).toHaveLength(3);
    expect(markup).toContain("</a>, Activity:");
    expect(state.links).toHaveLength(3);
  });

  it("canonicalizes and redacts a bare same-app absolute URL without turning it into a link", () => {
    const text = sanitizeAgentVisibleTextForApp(`Created http://localhost:4016/en${href}.`, "http://localhost:4016");
    const markup = renderMessage(text);

    expect(text).toBe("Created /contacts?view=[internal reference].");
    expect(markup).not.toContain("<a");
    expect(markup).not.toContain(viewId);
    expect(state.links).toHaveLength(0);
  });

  it("leaves exact view URLs inside inline and fenced code as code", () => {
    const markup = renderMessage(`Inline \`${href}\`\n\n~~~text\n${timelineHref}\n~~~`);

    expect(state.links).toHaveLength(0);
    expect(markup).not.toContain("AgentChat.openSavedView");
    expect(markup).toContain('data-streamdown="inline-code"');
    expect(markup).toContain('data-streamdown="code-block"');
  });

  it("does not upgrade external, operator or inexact bare URLs", () => {
    const operatorHref = `/operator/users?view=${viewId}`;
    const source = `External https://example.invalid${href} operator ${operatorHref} inexact ${href}&searchTerm=x`;
    const markup = renderMessage(source);

    expect(state.links).toHaveLength(0);
    expect(markup).not.toContain("AgentChat.openSavedView");
  });

  it("renders a malformed model-written local view destination as inert text", () => {
    const markup = renderMessage("[All contacts](__all__?view=__all__&viewSurface=contacts-card-store)");

    expect(markup).toContain("<span>All contacts</span>");
    expect(markup).not.toContain("href=");
    expect(markup).not.toContain('data-streamdown="link"');
    expect(state.links).toHaveLength(0);
  });

  it("keeps an unrelated local link with a view query an ordinary app link", () => {
    const markup = renderMessage("[Cloud CRM](/features/cloud-crm?view=kanban)");

    expect(markup).toMatch(/<a[^>]*>Cloud CRM<\/a>/);
    expect(markup).not.toContain("AgentChat.openSavedView");
    expect(state.links.map((link) => link.href)).toEqual(["/features/cloud-crm?view=kanban"]);
  });

  it("applies saved-view handling after raw HTML is sanitized and before remaining links are hardened", () => {
    const markup = renderMessage(
      `<a href="${href}">My view</a> <a href="__all__?view=__all__&viewSurface=contacts-card-store">Broken view</a> <a href="https://example.com">External</a>`,
    );

    expect(markup).toMatch(/<a[^>]*>My view<\/a>/);
    expect(markup).toContain("<span>Broken view</span>");
    expect(markup).toMatch(/<a[^>]*target="_blank"[^>]*>External<\/a>/);
    expect(state.links).toHaveLength(1);
  });
});
