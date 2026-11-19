import type { FocusEventHandler, PointerEventHandler, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type LinkProps = {
  href: string;
  children: ReactNode;
  prefetch?: boolean | null;
  onFocus?: FocusEventHandler<HTMLAnchorElement>;
  onPointerEnter?: PointerEventHandler<HTMLAnchorElement>;
};

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/w/acme/dashboard",
  IntlLink: ({ href, children, prefetch, onFocus, onPointerEnter }: LinkProps) => (
    <a data-prefetch={String(prefetch)} href={href} onFocus={onFocus} onPointerOver={onPointerEnter}>
      {children}
    </a>
  ),
}));

import { AppLink } from "../app-link";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function link() {
  const anchor = container.querySelector("a");
  if (!anchor) throw new Error("Missing link");
  return anchor;
}

describe("AppLink prefetchOnIntent", () => {
  it("keeps the default preloading for a normal link", () => {
    act(() => root.render(<AppLink href="/w/acme/inbox">Inbox</AppLink>));
    expect(link().dataset.prefetch).toBe("undefined");
  });

  it("does not preload a sidebar link until the pointer reaches it, and keeps the caller's handler", () => {
    const entered = vi.fn();
    act(() =>
      root.render(
        <AppLink prefetchOnIntent href="/w/acme/inbox" onPointerEnter={entered}>
          Inbox
        </AppLink>,
      ),
    );
    expect(link().dataset.prefetch).toBe("false");

    act(() => {
      link().dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });

    expect(link().dataset.prefetch).toBe("undefined");
    expect(entered).toHaveBeenCalledOnce();
  });

  it("preloads once the link gets keyboard focus", () => {
    act(() =>
      root.render(
        <AppLink prefetchOnIntent href="/w/acme/inbox">
          Inbox
        </AppLink>,
      ),
    );

    act(() => link().focus());

    expect(link().dataset.prefetch).toBe("undefined");
  });

  it("never preloads a link whose caller switched preloading off", () => {
    act(() =>
      root.render(
        <AppLink prefetchOnIntent href="/w/acme/inbox" prefetch={false}>
          Inbox
        </AppLink>,
      ),
    );

    act(() => link().focus());

    expect(link().dataset.prefetch).toBe("false");
  });
});
