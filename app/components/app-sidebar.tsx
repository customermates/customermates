"use client";

import type { ExtendedUser } from "@/features/user/user.types";
import type { SubscriptionStatus } from "@/generated/prisma";
import type { UpdateUserSettingsData } from "@/features/user/upsert/update-user-settings.interactor";
import type { NavGroup } from "./navigation/nav-main";
import type { NavSecondaryItem } from "./navigation/nav-secondary";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { usePathname as useIntlPathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useTheme } from "next-themes";
import {
  Building,
  Building2,
  CheckCircle2,
  MessageCircle,
  FileText,
  Package,
  Plus,
  LayoutGrid,
  TrendingUp,
  UserCircle,
  Users,
} from "lucide-react";
import { Resource, Theme as ThemeEnum } from "@/generated/prisma";
import { updateThemeAction } from "@/app/[locale]/(protected)/dashboard/actions";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { AppChip } from "@/components/chip/app-chip";
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/shared/icon";
import { signOutAction } from "@/app/[locale]/actions";
import { FeedbackType } from "@/features/feedback/send-feedback.schema";
import { EntityType, Action } from "@/generated/prisma";

import { NavHeader } from "./navigation/nav-header";
import { NavMain } from "./navigation/nav-main";
import { NavSecondary } from "./navigation/nav-secondary";
import { NavUser } from "./navigation/nav-user";

type Props = {
  systemTaskCount: number;
  user: ExtendedUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  trialDaysLeft: number | null;
};

export const AppSidebar = observer(function AppSidebar({
  user,
  systemTaskCount,
  subscriptionStatus,
  trialDaysLeft,
}: Props) {
  const t = useTranslations("");
  const pathname = usePathname();
  const intlPathname = useIntlPathname();
  const rootStore = useRootStore();
  const { userStore, globalSearchModalStore, feedbackModalStore } = rootStore;

  const { setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const openEntity = useOpenEntity();
  const isDocsRoute = pathname.split("/")[2] === "docs";
  const [selectedKey, setSelectedKey] = useState<string | null>(pathname.split("/")[2]);
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);

  async function handleThemeChange() {
    const next = theme === "dark" ? ThemeEnum.light : ThemeEnum.dark;
    setTheme(next);

    const currentUser = userStore.user;
    if (!currentUser) return;

    const settings: UpdateUserSettingsData = {
      theme: next,
      displayLanguage: currentUser.displayLanguage,
      formattingLocale: currentUser.formattingLocale,
    };
    const res = await updateThemeAction(settings);
    if (res.ok) userStore.updateUserSettings(res.data);
  }

  useEffect(() => setSelectedKey(pathname.split("/")[2] ?? null), [pathname]);

  function closeMobileSidebar(cb?: () => void) {
    if (typeof window !== "undefined" && window.innerWidth < 768) setOpenMobile(false);
    cb?.();
  }

  const navGroups: NavGroup[] = useMemo(
    () =>
      [
        {
          key: "overview",
          label: t("NavigationBar.overview"),
          items: [
            {
              key: "dashboard",
              title: t("NavigationBar.dashboard"),
              href: "/dashboard",
              icon: LayoutGrid,
              visible: true,
            },
            {
              key: "tasks",
              title: t("NavigationBar.tasks"),
              href: "/tasks",
              icon: CheckCircle2,
              visible: userStore.canAccess(Resource.tasks),
              badge: systemTaskCount,
            },
          ].filter((i) => i.visible),
        },
        {
          key: "crm",
          label: t("NavigationBar.crm"),
          items: [
            {
              key: "contacts",
              title: t("NavigationBar.contacts"),
              href: "/contacts",
              icon: Users,
              visible: userStore.canAccess(Resource.contacts),
            },
            {
              key: "organizations",
              title: t("NavigationBar.organizations"),
              href: "/organizations",
              icon: Building2,
              visible: userStore.canAccess(Resource.organizations),
            },
            {
              key: "deals",
              title: t("NavigationBar.deals"),
              href: "/deals",
              icon: TrendingUp,
              visible: userStore.canAccess(Resource.deals),
            },
            {
              key: "services",
              title: t("NavigationBar.services"),
              href: "/services",
              icon: Package,
              visible: userStore.canAccess(Resource.services),
            },
          ].filter((i) => i.visible),
        },
        {
          key: "workspace",
          label: t("NavigationBar.workspace"),
          items: [
            {
              key: "profile",
              title: t("UserAvatar.profile"),
              href: "/profile/details",
              icon: UserCircle,
              visible: true,
              items: [
                {
                  key: "profile-details",
                  title: t("NavigationBar.details"),
                  href: "/profile/details",
                  icon: UserCircle,
                  visible: true,
                },
                {
                  key: "profile-settings",
                  title: t("NavigationBar.settings"),
                  href: "/profile/settings",
                  icon: UserCircle,
                  visible: true,
                },
                {
                  key: "profile-api-keys",
                  title: t("ApiKeysCard.title"),
                  href: "/profile/api-keys",
                  icon: UserCircle,
                  visible: userStore.can(Resource.api, Action.readAll),
                },
              ].filter((i) => i.visible),
            },
            {
              key: "company",
              title: t("UserAvatar.company"),
              href: "/company/details",
              icon: Building,
              visible:
                userStore.canAccess(Resource.company) ||
                userStore.canAccess(Resource.users) ||
                (rootStore.isCloudHosted && userStore.can(Resource.auditLog, Action.readAll)) ||
                userStore.can(Resource.api, Action.readAll),
              items: [
                {
                  key: "company-details",
                  title: t("NavigationBar.general"),
                  href: "/company/details",
                  icon: Building,
                  visible: userStore.canAccess(Resource.company),
                },
                {
                  key: "company-members",
                  title: t("NavigationBar.members"),
                  href: "/company/members",
                  icon: Building,
                  visible: userStore.canAccess(Resource.users),
                },
                {
                  key: "company-roles",
                  title: t("RolesCard.title"),
                  href: "/company/roles",
                  icon: Building,
                  visible: userStore.canAccess(Resource.users),
                },
                {
                  key: "company-audit-logs",
                  title: t("AuditLogsCard.title"),
                  href: "/company/audit-logs",
                  icon: Building,
                  visible: rootStore.isCloudHosted && userStore.can(Resource.auditLog, Action.readAll),
                },
                {
                  key: "company-webhooks",
                  title: t("WebhooksCard.title"),
                  href: "/company/webhooks",
                  icon: Building,
                  visible: userStore.can(Resource.api, Action.readAll),
                },
                {
                  key: "company-webhook-deliveries",
                  title: t("WebhookDeliveriesCard.title"),
                  href: "/company/webhook-deliveries",
                  icon: Building,
                  visible: userStore.can(Resource.api, Action.readAll),
                },
              ].filter((i) => i.visible),
            },
          ].filter((i) => i.visible),
        },
      ].filter((g) => g.items.length > 0),
    [t, rootStore.isCloudHosted, subscriptionStatus, userStore.user, systemTaskCount],
  );

  const secondaryItems: NavSecondaryItem[] = useMemo(
    () => [
      {
        key: "documentation",
        title: t("UserAvatar.documentation"),
        icon: FileText,
        href: "/docs",
      },
      {
        key: "feedback",
        title: t("Common.inputs.feedback"),
        icon: MessageCircle,
        onSelect: () =>
          closeMobileSidebar(() => {
            feedbackModalStore.onInitOrRefresh({ type: FeedbackType.general, feedback: "" });
            feedbackModalStore.open();
          }),
      },
    ],
    [t],
  );

  const addItems = [
    {
      resource: Resource.contacts,
      key: "add_contact",
      label: t("NavigationBar.addContact"),
      entity: EntityType.contact,
    },
    {
      resource: Resource.organizations,
      key: "add_organization",
      label: t("NavigationBar.addOrganization"),
      entity: EntityType.organization,
    },
    { resource: Resource.deals, key: "add_deal", label: t("NavigationBar.addDeal"), entity: EntityType.deal },
    {
      resource: Resource.services,
      key: "add_service",
      label: t("NavigationBar.addService"),
      entity: EntityType.service,
    },
    { resource: Resource.tasks, key: "add_task", label: t("NavigationBar.addTask"), entity: EntityType.task },
  ];

  if (isDocsRoute) return null;

  const planSubtitle = buildPlanSubtitle(subscriptionStatus, trialDaysLeft, t);

  return (
    <>
      <Sidebar collapsible="icon" side="left" variant="inset">
        <NavHeader
          addLabel={t("Common.actions.add")}
          brandName="Customermates"
          brandSubtitle={planSubtitle}
          homeHref={rootStore.isDemoMode ? "https://customermates.com" : "/"}
          logoAlt={t("Common.imageAlt.logo")}
          searchLabel={t("NavigationBar.search")}
          onAdd={() => closeMobileSidebar(() => setIsAddPickerOpen(true))}
          onSearch={() => closeMobileSidebar(() => globalSearchModalStore.open())}
        />

        <SidebarContent>
          <NavMain
            groups={navGroups}
            pathname={intlPathname}
            selectedKey={selectedKey}
            onNavigate={(key) => closeMobileSidebar(() => setSelectedKey(key))}
          />

          <NavSecondary className="mt-auto" items={secondaryItems} />
        </SidebarContent>

        <SidebarFooter>
          <NavUser
            labels={{
              signOut: t("UserAvatar.signOut"),
              lightMode: t("UserAvatar.lightMode"),
              darkMode: t("UserAvatar.darkMode"),
            }}
            theme={theme}
            user={user}
            onSignOut={() => closeMobileSidebar(() => void signOutAction())}
            onThemeChange={() => void handleThemeChange()}
          />
        </SidebarFooter>
      </Sidebar>

      <AddPickerDrawer
        items={addItems.filter((item) => userStore.canManage(item.resource))}
        open={isAddPickerOpen}
        onOpenChange={setIsAddPickerOpen}
        onPick={(entity) => {
          setIsAddPickerOpen(false);
          openEntity(entity, "new");
        }}
      />
    </>
  );
});

type AddPickerItem = {
  key: string;
  label: string;
  entity: EntityType;
};

function AddPickerDrawer({
  items,
  open,
  onOpenChange,
  onPick,
}: {
  items: AddPickerItem[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (entity: EntityType) => void;
}) {
  const t = useTranslations("");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[420px]" side="right">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>{t("NavigationBar.addPickerTitle")}</SheetTitle>

          <SheetDescription>{t("NavigationBar.addPickerDescription")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-1 p-4">
          {items.map((item) => (
            <button
              key={item.key}
              className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              type="button"
              onClick={() => onPick(item.entity)}
            >
              <span>{item.label}</span>

              <Icon className="size-3.5 opacity-50" icon={Plus} />
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function buildPlanSubtitle(
  status: SubscriptionStatus | null,
  trialDaysLeft: number | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): React.ReactNode {
  if (!status || status === "active") return undefined;

  if (status === "trial") {
    const text =
      trialDaysLeft != null
        ? t("subscription.status.trialDaysLeft", { days: trialDaysLeft })
        : t("subscription.status.trial");
    const variant = trialDaysLeft != null && trialDaysLeft <= 3 ? "warning" : "success";
    return (
      <AppChip className="h-[18px] px-1.5 text-[10px]" variant={variant}>
        {text}
      </AppChip>
    );
  }

  return (
    <AppChip className="h-[18px] px-1.5 text-[10px]" variant="destructive">
      {t(`subscription.status.${status}`)}
    </AppChip>
  );
}
