"use client";

import type { ReactNode } from "react";

import { useEffect, useLayoutEffect, useTransition } from "react";

import { useNavigationGuard } from "@/components/modal/use-navigation-guard";
import { useRootStore } from "@/core/stores/root-store.provider";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import { useRouter } from "@/i18n/navigation";

export function WikiRouteScope({ children }: { children?: ReactNode }) {
  const { wikiPageStore } = useRootStore();
  const router = useRouter();
  const [, startNavigation] = useTransition();
  useNavigationGuard(wikiPageStore);
  useLayoutEffect(
    () =>
      wikiPageStore.attachOnChanged((pageId) => {
        const refresh = () => {
          router.replace(pageId ? wikiPagePath(pageId) : "/wiki");
          router.refresh();
        };
        if (pageId) refresh();
        else startNavigation(refresh);
      }),
    [router, wikiPageStore],
  );
  useEffect(() => () => wikiPageStore.releaseView(), [wikiPageStore]);
  return children;
}
