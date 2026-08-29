"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { ChevronDown } from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";
import { IntlLink } from "@/i18n/navigation";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

import { ShellHeader } from "./shell-header";
import { useTopBarActions } from "./topbar-actions-context";
import { buildAppTopbarCrumbs } from "./app-topbar-crumbs";

import { EntityType } from "@/generated/prisma";

export const AppTopBar = observer(({ operatorConsoleVisible }: { operatorConsoleVisible: boolean }) => {
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inboxThreadId = searchParams.get("threadId");
  const rootStore = useRootStore();
  const { layoutStore, userStore, terminologyStore } = rootStore;
  const { actions, joinedContentBelow, override } = useTopBarActions();
  const { plural } = useEntityTerminology();

  const entityLabels: Record<string, string> = {
    contacts: plural(EntityType.contact),
    organizations: plural(EntityType.organization),
    deals: plural(EntityType.deal),
    services: plural(EntityType.service),
    tasks: plural(EntityType.task),
  };

  const { crumbs, section } = useMemo(
    () =>
      buildAppTopbarCrumbs(
        pathname,
        t,
        entityLabels,
        layoutStore.runtimeIdentity,
        rootStore.appMode,
        userStore.canAccess,
        inboxThreadId,
        operatorConsoleVisible,
      ),
    [
      pathname,
      t,
      terminologyStore.overrides,
      layoutStore.runtimeIdentity,
      rootStore.appMode,
      userStore.user,
      inboxThreadId,
      operatorConsoleVisible,
    ],
  );

  if (crumbs.length === 0) return <ShellHeader actions={override ?? actions} joinedContentBelow={joinedContentBelow} />;

  return (
    <ShellHeader actions={override ?? actions} joinedContentBelow={joinedContentBelow}>
      <Breadcrumb aria-label={t("Common.ariaLabels.breadcrumb")} className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((c, i) => {
            const isLeaf = i === crumbs.length - 1;
            const hasSectionDropdown = Boolean(section) && crumbs.some((cr) => cr.siblings);
            const hideOnMobile = !isLeaf && hasSectionDropdown;
            return (
              <span
                key={i}
                className={cn(
                  "flex items-center gap-1.5 shrink-0",
                  isLeaf && "min-w-0 shrink",
                  hideOnMobile && "hidden lg:flex",
                )}
              >
                {i > 0 && <BreadcrumbSeparator className={cn("shrink-0", hasSectionDropdown && "hidden lg:flex")} />}

                <BreadcrumbItem className={cn(isLeaf ? "min-w-0" : "shrink-0")}>
                  {isLeaf && c.siblings && section ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex min-w-0 items-center gap-1 rounded-md text-foreground outline-none hover:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
                        <span className="truncate">{c.label}</span>

                        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="start">
                        {c.siblings.map((s) => (
                          <DropdownMenuItem key={s.slug} asChild>
                            <IntlLink href={`/${section}/${s.slug}`}>{s.label}</IntlLink>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : c.href && !isLeaf ? (
                    <BreadcrumbLink asChild>
                      <IntlLink href={c.href} prefetch={c.prefetch}>
                        {c.label}
                      </IntlLink>
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
