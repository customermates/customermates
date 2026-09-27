"use client";

import { useEffect } from "react";

import type { BaseFormStore } from "@/core/base/base-form.store";

import { stripLocalePrefix } from "@/i18n/locale-registry";
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

      let destination: URL;
      try {
        destination = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;

      event.preventDefault();
      event.stopPropagation();
      const path = `${stripLocalePrefix(destination.pathname)}${destination.search}${destination.hash}`;
      navigationGuard.tryNavigate(() => router.push(path));
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [navigationGuard, router]);
}
