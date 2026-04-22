"use client";

import type { ReactNode, SVGProps } from "react";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Code2,
  GitCompare,
  Key,
  LibraryBig,
  ListFilter,
  Network,
  PlayCircle,
  PlugZap,
  Puzzle,
  Rocket,
  Server,
  ServerCog,
  Shield,
  Sparkles,
  Webhook,
  Workflow,
} from "lucide-react";

import { getDocMethodColor } from "../docs.utils";
import { AppChip } from "@/components/chip/app-chip";
import { AppImage } from "@/components/shared/app-image";
import { Icon } from "@/components/shared/icon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ROUTING_LOCALES } from "@/i18n/routing";

export type DocSidebarItem = {
  key: string;
  url: string;
  title: string;
  icon: React.FC<SVGProps<SVGSVGElement>>;
  method?: string;
};

export type DocSidebarGroup = {
  key: string;
  label: string;
  items: DocSidebarItem[];
};

export function normalizeDocsPath(path: string): string {
  let normalized = path;
  if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);

  const localePattern = ROUTING_LOCALES.join("|");
  normalized = normalized.replace(new RegExp(`^/(?:${localePattern})(?=/|$)`), "") || "/";

  return normalized;
}

export function isDocItemActive(item: DocSidebarItem, normalizedPathname: string): boolean {
  const itemUrl = normalizeDocsPath(item.url);

  if (itemUrl === "/docs/openapi")
    return normalizedPathname === itemUrl || normalizedPathname.startsWith("/docs/openapi/");

  return normalizedPathname === itemUrl;
}

export function useDocGroups(): DocSidebarGroup[] {
  const t = useTranslations("");
  return [
    {
      key: "introduction",
      label: t("DocsSidebar.introduction"),
      items: [{ key: "introduction", url: "/docs", title: t("DocsSidebar.introduction"), icon: BookOpen }],
    },
    {
      key: "getting-started",
      label: t("DocsSidebar.gettingStarted"),
      items: [
        { key: "quickstart", url: "/docs/quickstart", title: t("DocsSidebar.quickstart"), icon: Rocket },
        { key: "concepts", url: "/docs/concepts", title: t("DocsSidebar.concepts"), icon: LibraryBig },
        { key: "from-pipedrive", url: "/docs/from-pipedrive", title: t("DocsSidebar.fromPipedrive"), icon: GitCompare },
      ],
    },
    {
      key: "integrations",
      label: t("DocsSidebar.integrations"),
      items: [
        {
          key: "integrations-intro",
          url: "/docs/integrations-intro",
          title: t("DocsSidebar.introduction"),
          icon: Puzzle,
        },
        { key: "integrations-mcp", url: "/docs/mcp", title: t("DocsSidebar.mcp"), icon: PlugZap },
        {
          key: "mcp-connect-claude",
          url: "/docs/mcp-connect-claude",
          title: t("DocsSidebar.connectClaude"),
          icon: Bot,
        },
        {
          key: "mcp-connect-chatgpt",
          url: "/docs/mcp-connect-chatgpt",
          title: t("DocsSidebar.connectChatgpt"),
          icon: Bot,
        },
        {
          key: "mcp-connect-cursor",
          url: "/docs/mcp-connect-cursor",
          title: t("DocsSidebar.connectCursor"),
          icon: Code2,
        },
        { key: "webhooks", url: "/docs/webhooks", title: t("DocsSidebar.webhooks"), icon: Webhook },
        { key: "integrations-openapi", url: "/docs/openapi", title: t("DocsSidebar.openapi"), icon: Code2 },
        { key: "integrations-n8n", url: "/docs/n8n", title: t("DocsSidebar.n8n"), icon: Workflow },
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
          icon: GitCompare,
        },
        { key: "self-hosting", url: "/docs/self-hosting", title: t("DocsSidebar.getStarted"), icon: Server },
        {
          key: "managing-your-installation",
          url: "/docs/managing-your-installation",
          title: t("DocsSidebar.managingYourInstallation"),
          icon: ServerCog,
        },
        {
          key: "architecture-security",
          url: "/docs/architecture-security",
          title: t("DocsSidebar.architectureSecurity"),
          icon: Shield,
        },
      ],
    },
    {
      key: "reference",
      label: t("DocsSidebar.reference"),
      items: [
        {
          key: "setup-ai-assistant",
          url: "/docs/setup-ai-assistant",
          title: t("DocsSidebar.setupAiAssistant"),
          icon: Sparkles,
        },
        {
          key: "mcp-tool-catalog",
          url: "/docs/mcp-tool-catalog",
          title: t("DocsSidebar.mcpToolCatalog"),
          icon: PlayCircle,
        },
        {
          key: "webhook-events",
          url: "/docs/webhook-events",
          title: t("DocsSidebar.webhookEvents"),
          icon: Webhook,
        },
        {
          key: "filter-syntax",
          url: "/docs/filter-syntax",
          title: t("DocsSidebar.filterSyntax"),
          icon: ListFilter,
        },
        { key: "api-keys", url: "/docs/api-keys", title: t("DocsSidebar.apiKeys"), icon: Key },
      ],
    },
    {
      key: "comparison",
      label: t("DocsSidebar.comparison"),
      items: [{ key: "comparison", url: "/docs/comparison", title: t("DocsSidebar.comparison"), icon: GitCompare }],
    },
  ];
}

function DocItemRow({ item, isActive }: { item: DocSidebarItem; isActive: boolean }): ReactNode {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
        <NextLink href={item.url}>
          <Icon icon={item.icon} />

          <span className="truncate">{item.title}</span>

          {item.method && (
            <AppChip className="ml-auto uppercase text-[10px]" size="sm" variant={getDocMethodColor(item.method)}>
              {item.method}
            </AppChip>
          )}
        </NextLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export const DocSidebarFallbackIcon = Network;

export const DocsSidebar = observer(() => {
  const t = useTranslations("");
  const pathname = usePathname();
  const groups = useDocGroups();
  const normalizedPathname = normalizeDocsPath(pathname);

  const logoAlt = t("Common.imageAlt.logo");

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <NextLink href="/">
                <AppImage
                  alt={logoAlt}
                  className="size-8 shrink-0 rounded-lg shadow-[0_0_10px_0] shadow-primary/10 dark:shadow-primary/20"
                  height={32}
                  loading="eager"
                  src="customermates-square.svg"
                  width={32}
                />

                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Customermates</span>

                  <span className="truncate text-xs text-muted-foreground">Documentation</span>
                </div>
              </NextLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {(() => {
          const leafGroups = groups.filter((g) => g.items.length === 1 && g.items[0].title === g.label);
          const labeledGroups = groups.filter((g) => !(g.items.length === 1 && g.items[0].title === g.label));

          return (
            <>
              {leafGroups.length > 0 && (
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {leafGroups.map((group) => (
                        <DocItemRow
                          key={group.key}
                          isActive={isDocItemActive(group.items[0], normalizedPathname)}
                          item={group.items[0]}
                        />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {labeledGroups.map((group) => (
                <SidebarGroup key={group.key}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>

                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <DocItemRow key={item.key} isActive={isDocItemActive(item, normalizedPathname)} item={item} />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </>
          );
        })()}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("DocsSidebar.goBack")}>
              <NextLink href="/">
                <Icon icon={ArrowLeft} />

                <span>{t("DocsSidebar.goBack")}</span>
              </NextLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
});
