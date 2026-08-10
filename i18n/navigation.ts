import { useMemo } from "react";

import { createNavigation } from "next-intl/navigation";

import { useRootStore } from "@/core/stores/root-store.provider";

import { stripLocalePrefix } from "./locale-registry";
import { routing } from "./routing";

const nav = createNavigation(routing);

export const { redirect, usePathname, Link: IntlLink } = nav;

function isSamePathnameNav(href: unknown): boolean {
  if (typeof window === "undefined" || typeof href !== "string") return false;
  try {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) return false;
    return stripLocalePrefix(target.pathname) === stripLocalePrefix(window.location.pathname);
  } catch {
    return false;
  }
}

export function useRouter() {
  const baseRouter = nav.useRouter();
  const { navigationGuard, loadingOverlayStore } = useRootStore();

  return useMemo(() => {
    const withLoading = <T>(href: unknown, fn: () => T): T => {
      if (!isSamePathnameNav(href)) loadingOverlayStore.setIsLoading(true);
      return fn();
    };

    return {
      push: ((href: Parameters<typeof baseRouter.push>[0], options?: Parameters<typeof baseRouter.push>[1]) =>
        navigationGuard.tryNavigate(() =>
          withLoading(href, () => baseRouter.push(href, options)),
        )) as typeof baseRouter.push,
      replace: ((href: Parameters<typeof baseRouter.replace>[0], options?: Parameters<typeof baseRouter.replace>[1]) =>
        navigationGuard.tryNavigate(() =>
          withLoading(href, () => baseRouter.replace(href, options)),
        )) as typeof baseRouter.replace,
      back: () => navigationGuard.tryNavigate(() => withLoading(undefined, () => baseRouter.back())),
      forward: () => navigationGuard.tryNavigate(() => withLoading(undefined, () => baseRouter.forward())),
      refresh: () => baseRouter.refresh(),
      prefetch: ((...args: Parameters<typeof baseRouter.prefetch>) =>
        baseRouter.prefetch(...args)) as typeof baseRouter.prefetch,
    };
  }, [baseRouter, navigationGuard, loadingOverlayStore]);
}
