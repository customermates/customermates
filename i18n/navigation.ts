import { useMemo } from "react";

import { createNavigation } from "next-intl/navigation";

import { useRootStore } from "@/core/stores/root-store.provider";

import { routing } from "./routing";

const nav = createNavigation(routing);

export const { redirect, usePathname, Link: IntlLink } = nav;

/**
 * Drop-in replacement for next-intl's `useRouter` that funnels every navigation through the
 * NavigationGuardController. When any registered form has unsaved changes, push/replace/back
 * surface the unsaved-changes modal instead of navigating immediately. `prefetch` and
 * `refresh` are unaffected.
 *
 * Also flips the global loading overlay on for any programmatic navigation, so users get the
 * same visual feedback they'd get from an anchor click. NavigationLoadingOverlay clears the
 * flag when usePathname() updates after the new route renders.
 */
export function useRouter() {
  const baseRouter = nav.useRouter();
  const { navigationGuard, loadingOverlayStore } = useRootStore();

  return useMemo(() => {
    const withLoading = <T>(fn: () => T): T => {
      loadingOverlayStore.setIsLoading(true);
      return fn();
    };

    return {
      push: ((href: Parameters<typeof baseRouter.push>[0], options?: Parameters<typeof baseRouter.push>[1]) =>
        navigationGuard.tryNavigate(() => withLoading(() => baseRouter.push(href, options)))) as typeof baseRouter.push,
      replace: ((href: Parameters<typeof baseRouter.replace>[0], options?: Parameters<typeof baseRouter.replace>[1]) =>
        navigationGuard.tryNavigate(() =>
          withLoading(() => baseRouter.replace(href, options)),
        )) as typeof baseRouter.replace,
      back: () => navigationGuard.tryNavigate(() => withLoading(() => baseRouter.back())),
      forward: () => navigationGuard.tryNavigate(() => withLoading(() => baseRouter.forward())),
      refresh: () => baseRouter.refresh(),
      prefetch: ((...args: Parameters<typeof baseRouter.prefetch>) =>
        baseRouter.prefetch(...args)) as typeof baseRouter.prefetch,
    };
  }, [baseRouter, navigationGuard, loadingOverlayStore]);
}
