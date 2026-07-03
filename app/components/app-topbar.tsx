"use client";

import { useMemo } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { ChevronDown } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
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
import { cn } from "@/lib/utils";
import { useRootStore } from "@/core/stores/root-store.provider";

import { ShellHeader } from "./shell-header";
import { useTopBarActions } from "./topbar-actions-context";

type Sibling = { slug: string; label: string };
type Crumb = { label: string; href?: string; siblings?: Sibling[]; pictureUrl?: string | null; isEntity?: boolean };

const GROUP_MAP: Record<string, { group: "overview" | "crm" | "settings" | null; label: string }> = {
  dashboard: { group: "overview", label: "dashboard" },
  inbox: { group: "overview", label: "inbox" },
  tasks: { group: "overview", label: "tasks" },
  contacts: { group: "crm", label: "contacts" },
  organizations: { group: "crm", label: "organizations" },
  deals: { group: "crm", label: "deals" },
  services: { group: "crm", label: "services" },
  settings: { group: "settings", label: "settings" },
  profile: { group: "settings", label: "profile" },
  company: { group: "settings", label: "company" },
};

const SUB_LABEL_MAP: Record<string, Record<string, string>> = {
  profile: {
    details: "NavigationBar.details",
    settings: "NavigationBar.settings",
    "api-keys": "ApiKeysCard.title",
    "connected-accounts": "ConnectedAccountsCard.title",
  },
  company: {
    details: "NavigationBar.general",
    members: "NavigationBar.members",
    roles: "RolesCard.title",
    "audit-logs": "AuditLogsCard.title",
    webhooks: "WebhooksCard.title",
    "webhook-deliveries": "WebhookDeliveriesCard.title",
  },
};

const SECTION_DEFAULT_SUBROUTE: Record<string, string> = {
  profile: "details",
  company: "details",
};

function getSectionHref(section: string): string {
  const defaultSub = SECTION_DEFAULT_SUBROUTE[section];
  return defaultSub ? `/${section}/${defaultSub}` : `/${section}`;
}

export const AppTopBar = observer(() => {
  const t = useTranslations();
  const pathname = usePathname();
  const { layoutStore } = useRootStore();
  const { actions, override } = useTopBarActions();

  const { crumbs, section } = useMemo(
    () =>
      buildCrumbs(
        pathname,
        t,
        layoutStore.runtimeTitle,
        layoutStore.runtimePictureUrl,
        layoutStore.runtimeAvatarKind !== null,
      ),
    [pathname, t, layoutStore.runtimeTitle, layoutStore.runtimePictureUrl, layoutStore.runtimeAvatarKind],
  );

  if (crumbs.length === 0) return <ShellHeader actions={override ?? actions} />;

  return (
    <ShellHeader actions={override ?? actions}>
      <Breadcrumb className="min-w-0">
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
                            <NextLink href={`/${section}/${s.slug}`}>{s.label}</NextLink>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : c.href && !isLeaf ? (
                    <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="flex min-w-0 items-center gap-1.5 truncate">
                      {isLeaf && c.isEntity && <Avatar name={c.label} size="sm" src={c.pictureUrl ?? null} />}

                      <span className="truncate">{c.label}</span>
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

function buildCrumbs(
  pathname: string,
  t: (k: string) => string,
  runtimeTitle: string | null,
  runtimePictureUrl: string | null,
  showLeafAvatar: boolean,
): { crumbs: Crumb[]; section: string | null } {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length <= 1) return { crumbs: [], section: null };
  const parts = segs.slice(1);

  const first = parts[0];
  const entry = GROUP_MAP[first];
  if (!entry) return { crumbs: [], section: null };

  const crumbs: Crumb[] = [];
  const leafKey = entry.group === "settings" ? `UserAvatar.${entry.label}` : `NavigationBar.${entry.label}`;
  crumbs.push({ label: t(leafKey), href: getSectionHref(first) });

  const subMap = SUB_LABEL_MAP[first];
  if (parts.length > 1) {
    const leaf = parts[1];
    const subKey = subMap?.[leaf];
    if (subKey) {
      const siblings: Sibling[] = Object.entries(subMap).map(([slug, key]) => ({ slug, label: t(key) }));
      crumbs.push({ label: t(subKey), siblings });
    } else {
      const fallback = leaf.length > 10 ? `${leaf.slice(0, 8)}…` : leaf;
      crumbs.push({
        label: runtimeTitle ?? fallback,
        pictureUrl: runtimePictureUrl,
        isEntity: showLeafAvatar,
      });
    }
  }

  if (first === "inbox" && runtimeTitle)
    crumbs.push({ label: runtimeTitle, pictureUrl: runtimePictureUrl, isEntity: showLeafAvatar });

  return { crumbs, section: subMap ? first : null };
}
