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
 */
export function useRouter() {
  const baseRouter = nav.useRouter();
  const { navigationGuard } = useRootStore();

  return useMemo(
    () => ({
      push: ((href: Parameters<typeof baseRouter.push>[0], options?: Parameters<typeof baseRouter.push>[1]) =>
        navigationGuard.tryNavigate(() => baseRouter.push(href, options))) as typeof baseRouter.push,
      replace: ((href: Parameters<typeof baseRouter.replace>[0], options?: Parameters<typeof baseRouter.replace>[1]) =>
        navigationGuard.tryNavigate(() => baseRouter.replace(href, options))) as typeof baseRouter.replace,
      back: () => navigationGuard.tryNavigate(() => baseRouter.back()),
      forward: () => navigationGuard.tryNavigate(() => baseRouter.forward()),
      refresh: () => baseRouter.refresh(),
      prefetch: ((...args: Parameters<typeof baseRouter.prefetch>) =>
        baseRouter.prefetch(...args)) as typeof baseRouter.prefetch,
    }),
    [baseRouter, navigationGuard],
  );
}
