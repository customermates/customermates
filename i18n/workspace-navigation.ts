"use client";

import { createElement, forwardRef, useMemo, type ComponentProps } from "react";
import { useParams } from "next/navigation";

import { createNavigation } from "next-intl/navigation";

import { useNavigationGuard } from "@/core/stores/navigation-guard.context";
import {
  isWorkspaceSlugSegment,
  splitWorkspacePath,
  withWorkspaceHref,
  workspaceSlugFromPathname,
} from "@/core/navigation/workspace-paths";

import { routing } from "./routing";

const nav = createNavigation(routing);

type Href = Parameters<ReturnType<typeof nav.useRouter>["push"]>[0];

export function useWorkspaceSlug(): string | null {
  const params = useParams<{ workspace?: string | string[] }>();
  const value = params?.workspace;
  return isWorkspaceSlugSegment(typeof value === "string" ? value : null) ? (value as string) : null;
}

export function workspaceHref<T extends Href | ComponentProps<typeof nav.Link>["href"]>(
  href: T,
  slug: string | null,
): T {
  if (!slug) return href;
  if (typeof href === "string") return withWorkspaceHref(href, slug) as T;
  if (href && typeof href === "object" && "pathname" in href && typeof href.pathname === "string")
    return { ...href, pathname: withWorkspaceHref(href.pathname, slug) } as T;
  return href;
}

function targetWorkspace(href: Href): string | null {
  const pathname = typeof href === "string" ? href : href.pathname;
  if (typeof pathname !== "string") return null;
  return workspaceSlugFromPathname(pathname.split(/[?#]/u, 1)[0] ?? "");
}

export function usePathname(): string {
  const pathname = nav.usePathname();
  return splitWorkspacePath(pathname)?.path ?? pathname;
}

export const IntlLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof nav.Link>>(function IntlLink(props, ref) {
  const slug = useWorkspaceSlug();
  return createElement(nav.Link, { ...props, href: workspaceHref(props.href, slug), ref });
});

export function useRouter() {
  const baseRouter = nav.useRouter();
  const navigationGuard = useNavigationGuard();
  const slug = useWorkspaceSlug();

  return useMemo(() => {
    const run = (action: () => void) => (navigationGuard ? navigationGuard.tryNavigate(action) : action());
    const navigate = (href: Href, soft: () => void) => {
      const target = targetWorkspace(href);
      if (target && target !== slug && typeof href === "string") window.location.assign(href);
      else soft();
    };

    return {
      push: ((href: Parameters<typeof baseRouter.push>[0], options?: Parameters<typeof baseRouter.push>[1]) => {
        const qualified = workspaceHref(href, slug);
        return run(() => navigate(qualified, () => baseRouter.push(qualified, options)));
      }) as typeof baseRouter.push,
      replace: ((
        href: Parameters<typeof baseRouter.replace>[0],
        options?: Parameters<typeof baseRouter.replace>[1],
      ) => {
        const qualified = workspaceHref(href, slug);
        return run(() => navigate(qualified, () => baseRouter.replace(qualified, options)));
      }) as typeof baseRouter.replace,
      back: () => run(() => baseRouter.back()),
      forward: () => run(() => baseRouter.forward()),
      refresh: () => baseRouter.refresh(),
      prefetch: ((
        href: Parameters<typeof baseRouter.prefetch>[0],
        options?: Parameters<typeof baseRouter.prefetch>[1],
      ) => baseRouter.prefetch(workspaceHref(href, slug), options)) as typeof baseRouter.prefetch,
    };
  }, [baseRouter, navigationGuard, slug]);
}
