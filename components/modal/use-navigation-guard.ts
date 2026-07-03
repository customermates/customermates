"use client";

import { useEffect } from "react";

import type { BaseFormStore } from "@/core/base/base-form.store";

import { useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";

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

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      const innerInteractive = target?.closest('button, [role="button"]');
      if (innerInteractive && innerInteractive !== anchor && anchor.contains(innerInteractive)) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const isAbsolute = /^[a-z]+:\/\//i.test(href);
      if (isAbsolute && !href.startsWith(window.location.origin)) return;

      event.preventDefault();
      event.stopPropagation();
      const path = isAbsolute ? href.slice(window.location.origin.length) : href;
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
