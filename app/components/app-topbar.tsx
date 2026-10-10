"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";
import { IntlLink } from "@/i18n/navigation";

import { ShellHeader } from "./shell-header";
import { stripLocalePrefix } from "@/i18n/locale-registry";
import { useTopBarActions } from "./topbar-actions-context";
import { buildAppTopbarCrumbs } from "./app-topbar-crumbs";

export const AppTopBar = observer(({ operatorConsoleVisible }: { operatorConsoleVisible: boolean }) => {
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inboxThreadId = searchParams.get("threadId");
  const rootStore = useRootStore();
  const navigationDisabled = !rootStore.recordWorkspaceStore.routeReady(stripLocalePrefix(pathname));
  const { layoutStore } = rootStore;
  const { actions, override } = useTopBarActions();

  const { crumbs } = useMemo(
    () => buildAppTopbarCrumbs(pathname, t, layoutStore.runtimeIdentity, inboxThreadId, operatorConsoleVisible),
    [pathname, t, layoutStore.runtimeIdentity, inboxThreadId, operatorConsoleVisible],
  );

  if (crumbs.length === 0) return <ShellHeader actions={override ?? actions} navigationDisabled={navigationDisabled} />;

  return (
    <ShellHeader actions={override ?? actions} navigationDisabled={navigationDisabled}>
      <Breadcrumb aria-label={t("Common.ariaLabels.breadcrumb")} className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((c, i) => {
            const isLeaf = i === crumbs.length - 1;
            return (
              <span key={i} className={cn("flex items-center gap-1.5 shrink-0", isLeaf && "min-w-0 shrink")}>
                {i > 0 && <BreadcrumbSeparator className="shrink-0" />}

                <BreadcrumbItem className={cn(isLeaf ? "min-w-0" : "shrink-0")}>
                  {c.href && !isLeaf ? (
                    <BreadcrumbLink asChild>
                      <IntlLink href={c.href}>{c.label}</IntlLink>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage
                      aria-busy={c.isLoading || undefined}
                      className="flex min-w-0 items-center gap-1.5 truncate"
                      data-entity-crumb-loading={c.isLoading || undefined}
                    >
                      {c.isLoading ? (
                        <>
                          {c.showAvatarPlaceholder && (
                            <Skeleton aria-hidden="true" className="size-4 shrink-0 rounded-sm" />
                          )}

                          <Skeleton aria-hidden="true" className="h-4 w-24 max-w-[30vw] rounded-sm" />

                          <span className="sr-only">{c.label}</span>
                        </>
                      ) : (
                        <>
                          {isLeaf && c.isEntity && <Avatar name={c.label} size="sm" src={c.pictureUrl ?? null} />}

                          <span className="truncate">{c.label}</span>
                        </>
                      )}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </ShellHeader>
  );
});
