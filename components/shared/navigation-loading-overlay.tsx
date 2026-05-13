"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { ROUTING_LOCALES } from "@/i18n/routing";
import { useRootStore } from "@/core/stores/root-store.provider";

const NAVIGATION_TIMEOUT_MS = 10_000;

function stripLocale(pathname: string): string {
  for (const locale of ROUTING_LOCALES) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(`/${locale}`.length);
  }
  return pathname;
}

export function NavigationLoadingOverlay() {
  const pathname = usePathname();
  const { loadingOverlayStore } = useRootStore();

  useEffect(() => {
    loadingOverlayStore.setIsLoading(false);
  }, [pathname, loadingOverlayStore]);

  useEffect(() => {
    let safetyTimeout: ReturnType<typeof setTimeout> | null = null;

    function clearSafety() {
      if (safetyTimeout !== null) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
      }
    }

    function handleClick(event: MouseEvent) {
      if (event.button !== 0) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

      const link = (event.target as HTMLElement | null)?.closest("a");
      if (!link) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const href = link.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;

      const url = new URL(href, window.location.href);
      const currentPath = stripLocale(window.location.pathname);
      const targetPath = stripLocale(url.pathname);
      if (currentPath === targetPath && url.search === window.location.search) return;

      loadingOverlayStore.setIsLoading(true);

      clearSafety();
      safetyTimeout = setTimeout(() => loadingOverlayStore.setIsLoading(false), NAVIGATION_TIMEOUT_MS);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      clearSafety();
      document.removeEventListener("click", handleClick, true);
    };
  }, [loadingOverlayStore]);

  return null;
}
