import type { RuntimeIdentity } from "@/components/layout/layout.store";

import { OPERATOR_SUBROUTES } from "./navigation/operator-sections";
import { SETTINGS_SECTIONS, settingsSectionOf } from "./navigation/settings-sections";
import { SETTINGS_ENTRY_HREF } from "./navigation/settings-routes";

export type AppTopbarCrumb = {
  label: string;
  href?: string;
  pictureUrl?: string | null;
  isEntity?: boolean;
  isLoading?: boolean;
  showAvatarPlaceholder?: boolean;
};

const PAGE_LABEL_KEYS: Record<string, string> = {
  dashboard: "NavigationBar.dashboard",
  inbox: "NavigationBar.inbox",
  wiki: "NavigationBar.wiki",
  routines: "NavigationBar.routines",
  settings: "NavigationBar.settings",
  operator: "NavigationBar.operator",
};

export function buildAppTopbarCrumbs(
  pathname: string,
  t: (key: string) => string,
  runtimeIdentity: RuntimeIdentity | null,
  inboxThreadId: string | null = null,
  operatorConsoleVisible = false,
): { crumbs: AppTopbarCrumb[] } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return { crumbs: [] };
  const parts = segments.slice(1);

  const first = parts[0];
  if (first === "records") {
    const identity =
      runtimeIdentity?.scope === "entity" && runtimeIdentity.key === `records:${parts[1]}` ? runtimeIdentity : null;
    const record = parts[2] && identity?.record?.id === parts[2] ? identity.record : undefined;
    return {
      crumbs: [
        {
          label: identity?.title ?? t("RecordModel.records"),
          isLoading: !identity,
          ...(parts[2] ? { href: `/records/${parts[1]}` } : {}),
        },
        ...(parts[2]
          ? [
              {
                label: record?.title ?? t("PageState.loading"),
                isLoading: !record,
                isEntity: record?.showAvatar,
                pictureUrl: record?.pictureUrl,
              },
            ]
          : []),
      ],
    };
  }
  if (first === "configure") {
    const list = runtimeIdentity?.scope === "entity" && runtimeIdentity.key === "configure" ? runtimeIdentity : null;
    return {
      crumbs: list
        ? [{ label: t("RecordModel.configure"), href: "/configure" }, { label: list.title }]
        : [{ label: t("RecordModel.configure") }],
    };
  }
  if (first === "operator" && !operatorConsoleVisible) return { crumbs: [] };

  const labelKey = PAGE_LABEL_KEYS[first];
  if (!labelKey) return { crumbs: [] };

  const crumbs: AppTopbarCrumb[] = [];
  const sectionHref =
    first === "settings" ? SETTINGS_ENTRY_HREF : first === "operator" ? "/operator/overview" : `/${first}`;
  crumbs.push({ label: t(labelKey), href: sectionHref });

  if (parts.length > 1) {
    const leaf = parts[1];
    const settingsSection = first === "settings" ? settingsSectionOf(leaf) : null;
    const subroute = settingsSection
      ? SETTINGS_SECTIONS[settingsSection].find((route) => route.slug === leaf)
      : first === "operator"
        ? OPERATOR_SUBROUTES.find((route) => route.slug === leaf)
        : undefined;

    if (subroute) crumbs.push({ label: t(subroute.labelKey) });
    else {
      const matchingIdentity =
        runtimeIdentity?.scope === "entity" && runtimeIdentity.key === `${first}:${leaf}` ? runtimeIdentity : null;
      crumbs.push({
        label: matchingIdentity?.title ?? t("PageState.loading"),
        pictureUrl: matchingIdentity?.pictureUrl,
        isEntity: matchingIdentity?.avatarKind != null,
        isLoading: matchingIdentity === null,
      });
    }
  }

  if (first === "inbox" && inboxThreadId) {
    const matchingIdentity =
      runtimeIdentity?.scope === "inbox" && runtimeIdentity.key === inboxThreadId ? runtimeIdentity : null;
    crumbs.push({
      label: matchingIdentity?.title ?? t("PageState.loading"),
      pictureUrl: matchingIdentity?.pictureUrl,
      isEntity: matchingIdentity?.avatarKind != null,
      isLoading: matchingIdentity === null,
      showAvatarPlaceholder: true,
    });
  }

  return { crumbs };
}
