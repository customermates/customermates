"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@heroui/theme";
import { observer } from "mobx-react-lite";

import { getDocMethodColor } from "../docs.utils";

import { SidebarFrame } from "@/app/components/navigation/sidebar-frame";
import { XLink } from "@/components/x-link";
import { XChip } from "@/components/x-chip/x-chip";
import { XIcon } from "@/components/x-icon";
import { XImage } from "@/components/x-image";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ROUTING_LOCALES } from "@/i18n/routing";

export type DocSidebarItem = {
  key: string;
  url: string;
  title: string;
  method?: string;
};

export type DocSidebarGroup = {
  key: string;
  label: string;
  items?: DocSidebarItem[];
  children?: DocSidebarGroup[];
};

export const DocsSidebar = observer(() => {
  const t = useTranslations("");
  const pathname = usePathname();
  const { layoutStore } = useRootStore();
  const { isSidebarOpen } = layoutStore;
  const groups: DocSidebarGroup[] = [
    {
      key: "introduction",
      label: t("DocsSidebar.introduction"),
      items: [{ key: "introduction", url: "/docs", title: t("DocsSidebar.introduction") }],
    },
    {
      key: "comparison",
      label: t("DocsSidebar.comparison"),
      items: [{ key: "comparison", url: "/docs/comparison", title: t("DocsSidebar.comparison") }],
    },
    {
      key: "architecture-security",
      label: t("DocsSidebar.architectureSecurity"),
      items: [
        {
          key: "architecture-security",
          url: "/docs/architecture-security",
          title: t("DocsSidebar.architectureSecurity"),
        },
      ],
    },
    {
      key: "self-hosting",
      label: t("DocsSidebar.selfHosting"),
      items: [
        {
          key: "self-host-vs-cloud",
          url: "/docs/self-host-vs-cloud",
          title: t("DocsSidebar.selfHostVsCloud"),
        },
        {
          key: "self-hosting",
          url: "/docs/self-hosting",
          title: t("DocsSidebar.getStarted"),
        },
        {
          key: "managing-your-installation",
          url: "/docs/managing-your-installation",
          title: t("DocsSidebar.managingYourInstallation"),
        },
      ],
    },
    {
      key: "integrations",
      label: t("DocsSidebar.integrations"),
      items: [
        { key: "integrations-intro", url: "/docs/integrations-intro", title: t("DocsSidebar.introduction") },
        { key: "integrations-openapi", url: "/docs/openapi", title: t("DocsSidebar.openapi") },
        { key: "integrations-mcp", url: "/docs/mcp", title: t("DocsSidebar.mcp") },
        {
          key: "integrations-openclaw-ai-agents",
          url: "/docs/openclaw-and-ai-agents",
          title: t("DocsSidebar.openClawAiAgents"),
        },
        { key: "integrations-n8n", url: "/docs/n8n", title: t("DocsSidebar.n8n") },
        { key: "integrations-skills", url: "/docs/skills", title: t("DocsSidebar.skills") },
      ],
    },
    {
      key: "features",
      label: t("DocsSidebar.features"),
      items: [
        {
          key: "features-report-statistics",
          url: "/docs/features-report-statistics",
          title: t("DocsSidebar.reportAndStatistics"),
        },
        {
          key: "features-custom-columns",
          url: "/docs/features-custom-columns",
          title: t("DocsSidebar.customColumns"),
        },
        {
          key: "features-table-kanban-view",
          url: "/docs/features-table-kanban-view",
          title: t("DocsSidebar.tableAndKanbanView"),
        },
        {
          key: "features-webhooks-events",
          url: "/docs/features-webhooks-events",
          title: t("DocsSidebar.webhooksEvents"),
        },
        {
          key: "features-permissions-roles",
          url: "/docs/features-permissions-roles",
          title: t("DocsSidebar.permissionsRoles"),
        },
        {
          key: "features-audit-logging",
          url: "/docs/features-audit-logging",
          title: t("DocsSidebar.auditLogging"),
        },
      ],
    },
  ];

  function normalizePath(path: string) {
    let normalized = path;
    if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);

    const localePattern = ROUTING_LOCALES.join("|");
    normalized = normalized.replace(new RegExp(`^/(?:${localePattern})(?=/|$)`), "") || "/";

    return normalized;
  }

  const normalizedPathname = normalizePath(pathname);

  function isItemActive(item: DocSidebarItem): boolean {
    const itemUrl = normalizePath(item.url);

    if (itemUrl === "/docs/skills")
      return normalizedPathname === itemUrl || normalizedPathname.startsWith(`${itemUrl}/`);

    if (itemUrl === "/docs/openapi")
      return normalizedPathname === itemUrl || normalizedPathname.startsWith("/docs/openapi/");

    return normalizedPathname === itemUrl;
  }

  function groupHasActiveRoute(group: DocSidebarGroup): boolean {
    const hasActiveItem = group.items?.some((item) => isItemActive(item)) ?? false;
    if (hasActiveItem) return true;
    return group.children?.some((child) => groupHasActiveRoute(child)) ?? false;
  }

  function collectGroupKeys(nodes: DocSidebarGroup[]): string[] {
    return nodes.flatMap((node) => [node.key, ...(node.children ? collectGroupKeys(node.children) : [])]);
  }

  function collectActiveGroupKeys(nodes: DocSidebarGroup[]): string[] {
    return nodes.flatMap((node) => {
      const own = groupHasActiveRoute(node) ? [node.key] : [];
      const child = node.children ? collectActiveGroupKeys(node.children) : [];
      return [...own, ...child];
    });
  }

  const allGroupKeys = collectGroupKeys(groups);
  const activeGroupKeys = collectActiveGroupKeys(groups);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(allGroupKeys));

  useEffect(() => {
    if (activeGroupKeys.length === 0) return;
    setExpandedKeys((prev) => new Set([...prev, ...activeGroupKeys]));
  }, [pathname]);

  function toggleGroup(groupKey: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  function handleSidebarPress(callback?: () => void) {
    if (window.innerWidth < 768) layoutStore.setIsSidebarOpen(false);
    callback?.();
  }

  function getButtonClassName(additionalClasses?: string) {
    return cn("justify-start mx-3 px-3 font-normal", additionalClasses);
  }

  function getNavItemClassName(isSelected: boolean, additionalClasses?: string) {
    return cn(
      getButtonClassName("h-9 rounded-lg transition-colors"),
      isSelected
        ? "bg-default-300/80 dark:bg-default-200/30 text-foreground font-medium"
        : "text-default-900 dark:text-default-800 hover:text-foreground hover:bg-default-100 dark:hover:bg-default-100/10",
      additionalClasses,
    );
  }

  function renderGroup(group: DocSidebarGroup, depth = 0): React.ReactNode {
    const isExpanded = expandedKeys.has(group.key);
    const isGroupActive = groupHasActiveRoute(group);
    const hasChildren = (group.children?.length ?? 0) > 0;
    const hasItems = (group.items?.length ?? 0) > 0;
    const isLeaf =
      !hasChildren && hasItems && (group.items?.length ?? 0) === 1 && group.items?.[0]?.title === group.label;

    const nestedOffsetClass = depth === 0 ? "ml-6 pl-2" : "ml-4 pl-2";

    return (
      <div key={group.key} className="space-y-1">
        {isLeaf ? (
          <XLink
            className={getNavItemClassName(isGroupActive)}
            color="foreground"
            href={group.items?.[0].url ?? "/docs"}
            size="sm"
            onPress={() => handleSidebarPress()}
          >
            <span className="tracking-normal text-sm font-normal">{group.label}</span>
          </XLink>
        ) : (
          <Button
            className={getNavItemClassName(isGroupActive)}
            endContent={
              <XIcon
                className={cn("transition-transform", isExpanded ? "rotate-90" : "")}
                icon={ChevronRightIcon}
                size="sm"
              />
            }
            variant="light"
            onPress={() => toggleGroup(group.key)}
          >
            <span className="tracking-normal text-sm font-normal">{group.label}</span>
          </Button>
        )}

        {!isLeaf && isExpanded ? (
          <div className={cn("border-l border-divider space-y-0.5", nestedOffsetClass)}>
            {group.items?.map((item) => {
              const isActive = isItemActive(item);

              return (
                <XLink
                  key={item.key}
                  className={cn(
                    "relative flex items-center justify-between gap-2 min-w-0 h-8 rounded-md px-3 transition-colors",
                    isActive
                      ? "bg-default-300/80 dark:bg-default-200/30 text-foreground font-medium"
                      : "text-default-900 dark:text-default-800 hover:text-foreground hover:bg-default-100 dark:hover:bg-default-100/10",
                  )}
                  color="foreground"
                  href={item.url}
                  size="sm"
                  onPress={() => handleSidebarPress()}
                >
                  <span
                    className={cn(
                      "absolute -left-[9px] top-1/2 h-5 -translate-y-1/2 border-l-2",
                      isActive ? "border-primary" : "border-transparent",
                    )}
                  />

                  <span className="truncate text-xs">{item.title}</span>

                  {item.method && (
                    <XChip className="shrink-0 uppercase text-[10px]" color={getDocMethodColor(item.method)} size="sm">
                      {item.method}
                    </XChip>
                  )}
                </XLink>
              );
            })}

            {group.children?.map((child) => renderGroup(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  const sidebarContent = (
    <>
      <Button
        as={XLink}
        className="mb-4 font-normal justify-start mx-3 px-3"
        href="/"
        isIconOnly={false}
        variant="light"
        onPress={() => handleSidebarPress()}
      >
        <XImage
          alt={t("Common.imageAlt.logo")}
          className="object-contain select-none"
          height={24}
          loading="eager"
          src="customermates.svg"
          width={140}
        />
      </Button>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1">
        <div className="space-y-1">{groups.map((group) => renderGroup(group))}</div>
      </nav>

      <Button
        as={XLink}
        className="mt-2 justify-start mx-3 px-3 font-normal"
        href="/"
        isIconOnly={false}
        variant="light"
        onPress={() => handleSidebarPress()}
      >
        <span className="tracking-normal text-sm font-normal">{t("DocsSidebar.goBack")}</span>
      </Button>
    </>
  );

  return (
    <SidebarFrame
      isMobileOpen={isSidebarOpen}
      onMobileClose={() => layoutStore.setIsSidebarOpen(false)}
      onMobileOpen={() => layoutStore.setIsSidebarOpen(true)}
    >
      {sidebarContent}
    </SidebarFrame>
  );
});
