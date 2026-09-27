import { useMemo } from "react";

import { createNavigation } from "next-intl/navigation";

import { useNavigationGuard } from "@/core/stores/navigation-guard.context";

import { routing } from "./routing";

const nav = createNavigation(routing);

export const { redirect, usePathname, Link: IntlLink } = nav;

export function useRouter() {
  const baseRouter = nav.useRouter();
  const navigationGuard = useNavigationGuard();

  return useMemo(() => {
    const run = (action: () => void) => (navigationGuard ? navigationGuard.tryNavigate(action) : action());

    return {
      push: ((href: Parameters<typeof baseRouter.push>[0], options?: Parameters<typeof baseRouter.push>[1]) =>
        run(() => baseRouter.push(href, options))) as typeof baseRouter.push,
      replace: ((href: Parameters<typeof baseRouter.replace>[0], options?: Parameters<typeof baseRouter.replace>[1]) =>
        run(() => baseRouter.replace(href, options))) as typeof baseRouter.replace,
      back: () => run(() => baseRouter.back()),
      forward: () => run(() => baseRouter.forward()),
      refresh: () => baseRouter.refresh(),
      prefetch: ((...args: Parameters<typeof baseRouter.prefetch>) =>
        baseRouter.prefetch(...args)) as typeof baseRouter.prefetch,
    };
  }, [baseRouter, navigationGuard]);
}
