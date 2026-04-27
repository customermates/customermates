"use client";

import { useEffect } from "react";

import type { BaseFormStore } from "@/core/base/base-form.store";

import { useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";

/**
 * Registers a form store with the global NavigationGuardController so that, while the form
 * has unsaved changes, page-level navigation is intercepted and the user is asked to confirm.
 *
 * Covers:
 * - Clicks on internal `<a>` links (Next.js Link, sidebar, etc.).
 * - Browser refresh, tab close (beforeunload — browser-native dialog).
 *
 * Browser back/forward is intentionally NOT blocked: by the time popstate fires the URL has
 * already changed, so the only way to "undo" the navigation is the sentinel-state pattern,
 * which is fragile around multiple back presses and forward navigation. beforeunload still
 * fires for full page reloads.
 *
 * The actual confirmation modal is rendered once at the root layout via <NavigationGuardModal/>.
 */
export function useNavigationGuard(store: BaseFormStore): void {
  const { navigationGuard } = useRootStore();
  const router = useRouter();

  useEffect(() => {
    navigationGuard.register(store);
    return () => navigationGuard.unregister(store);
  }, [store, navigationGuard]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!navigationGuard.isGuarding) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handleClick(event: MouseEvent) {
      if (!navigationGuard.isGuarding) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;

      // External links — let the browser handle them (beforeunload still applies).
      const isAbsolute = /^[a-z]+:\/\//i.test(href);
      if (isAbsolute && !href.startsWith(window.location.origin)) return;

      event.preventDefault();
      event.stopPropagation();
      const path = isAbsolute ? href.slice(window.location.origin.length) : href;
      // Strip the [locale] segment that next-intl prepends in the rendered href.
      const localeStripped = path.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
      navigationGuard.tryNavigate(() => router.push(localeStripped));
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [navigationGuard, router]);
}
