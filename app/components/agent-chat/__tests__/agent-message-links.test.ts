import type { AnchorHTMLAttributes, MouseEvent } from "react";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  locale: "de",
  push: vi.fn(),
  guard: null as NavigationGuardController | null,
  links: [] as AnchorHTMLAttributes<HTMLAnchorElement>[],
}));

vi.mock("next-intl", () => ({
  useLocale: () => state.locale,
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ navigationGuard: state.guard }),
}));
vi.mock("next-intl/navigation", async () => {
  const { createElement } = await import("react");
  return {
    createNavigation: () => ({
      usePathname: () => "/contacts",
      useRouter: () => ({ push: state.push }),
      Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
        state.links.push(props);
        return createElement("a", { ...props, href: `/${state.locale}${props.href}` }, children);
      },
    }),
  };
});

import { MessageResponse } from "@/components/ai-elements/message";
import { dataViewNavigationHref } from "@/core/data-view/data-view-links";
import { DATA_VIEW_PATHS } from "@/core/data-view/data-view-paths";
import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { agentMessageComponents, agentMessageRehypePlugins } from "../agent-message-links";

const viewId = "00000000-0000-4000-8000-000000000001";
const href = `/contacts?view=${viewId}`;
function renderMessage(text: string) {
  return renderToStaticMarkup(
    createElement(
      MessageResponse,
      { mode: "static", components: agentMessageComponents, rehypePlugins: agentMessageRehypePlugins },
      text,
    ),
  );
}
function click(overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as MouseEvent<HTMLAnchorElement>;
}

beforeEach(() => {
  state.locale = "de";
  state.push.mockClear();
  state.links = [];
  state.guard = new NavigationGuardController();
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

  it("renders local views as locale-aware anchors and leaves other links behind the safety dialog", () => {
    const markup = renderMessage(`[My view](/en${href}) [External](https://example.com) [Other](/dashboard)`);
    expect(markup).toContain(`href="/de${href}"`);
    expect(markup).toMatch(/<a[^>]*>My view<\/a>/);
    expect(markup).toMatch(/<button[^>]*data-streamdown="link"[^>]*>External<\/button>/);
    expect(markup).toMatch(/<button[^>]*data-streamdown="link"[^>]*>Other<\/button>/);
    expect(state.links).toHaveLength(1);
  });

  it("uses the navigation guard once and waits for unsaved-change confirmation", () => {
    const dirty = { withUnsavedChangesGuard: true, hasUnsavedChanges: true } as BaseFormStore;
    state.guard?.register(dirty);
    renderMessage(`[My view](${href})`);
    const preventDefault = vi.fn();
    const event = click({ preventDefault });
    state.links[0].onClick?.(event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(state.push).not.toHaveBeenCalled();
    expect(state.guard?.isPending).toBe(true);
    state.guard?.confirm();
    expect(state.push).toHaveBeenCalledExactlyOnceWith(href, undefined);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
    "keeps normal anchor behavior for a modified click: %j",
    (modifiers) => {
      renderMessage(`[My view](${href})`);
      const preventDefault = vi.fn();
      const event = click({ ...modifiers, preventDefault });
      state.links[0].onClick?.(event);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(state.push).not.toHaveBeenCalled();
      expect(state.guard?.isPending).toBe(false);
    },
  );
});
