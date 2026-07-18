"use client";

import type { ExtendedUser } from "@/features/user/user.types";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { SubscriptionStatus } from "@/generated/prisma";
import type { NavGroup } from "./navigation/nav-main";
import type { NavSecondaryItem } from "./navigation/nav-secondary";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { usePathname as useIntlPathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useTheme } from "next-themes";
import {
  Building,
  Building2,
  CheckCircle2,
  MessageCircle,
  FileText,
  Inbox,
  Mail,
  Package,
  Plus,
  LayoutGrid,
  TrendingUp,
  UserCircle,
  Users,
} from "lucide-react";
import { Resource, Theme as ThemeEnum } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { AppChip } from "@/components/chip/app-chip";
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/shared/icon";
import { signOutAction } from "@/app/[locale]/actions";
import { FeedbackType } from "@/features/feedback/send-feedback.schema";
import { EntityType } from "@/generated/prisma";

import { NavHeader } from "./navigation/nav-header";
import { visibleSubroutes } from "./navigation/workspace-sections";
import { NavMain } from "./navigation/nav-main";
import { NavSecondary } from "./navigation/nav-secondary";
import { NavUser } from "./navigation/nav-user";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Props = {
  systemTaskCount: number;
  unreadThreadCount: number;
  channelsNeedingActionCount: number;
  user: ExtendedUser | null;
  subscription: SubscriptionDto | null;
  trialDaysLeft: number | null;
  emailVerified: boolean | null;
};

export const AppSidebar = observer(
  ({
    user,
    systemTaskCount,
    unreadThreadCount,
    channelsNeedingActionCount,
    subscription,
    trialDaysLeft,
    emailVerified,
  }: Props) => {
    const t = useTranslations();
    const pathname = usePathname();
    const intlPathname = useIntlPathname();
    const router = useRouter();
    const rootStore = useRootStore();
    const { userStore, globalSearchModalStore, feedbackModalStore } = rootStore;

    const { setOpenMobile } = useSidebar();
    const { resolvedTheme, setTheme } = useTheme();
    const openEntity = useOpenEntity();
    const subscriptionStatus = subscription?.status ?? null;
    const isDocsRoute = pathname.split("/")[2] === "docs";
    const [selectedKey, setSelectedKey] = useState<string | null>(pathname.split("/")[2]);
    const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);

    function handleThemeChange() {
      const next = resolvedTheme === "dark" ? ThemeEnum.light : ThemeEnum.dark;
      setTheme(next);
      void userStore.updateTheme(next);
    }

    useEffect(() => setSelectedKey(pathname.split("/")[2] ?? null), [pathname]);

    function closeMobileSidebar(cb?: () => void) {
      if (typeof window !== "undefined" && window.innerWidth < 768) setOpenMobile(false);
      cb?.();
    }

    const navGroups: NavGroup[] = useMemo(() => {
      const profileSubroutes = visibleSubroutes("profile", rootStore.appMode, userStore.canAccess);
      const companySubroutes = visibleSubroutes("company", rootStore.appMode, userStore.canAccess);

      return [
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
              key: "inbox",
              title: t("NavigationBar.inbox"),
              href: "/inbox",
              icon: Inbox,
              visible: userStore.canAccess(Resource.inboxMessages) && rootStore.appMode !== "self-hosted",
              badge: unreadThreadCount,
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
              href: `/profile/${profileSubroutes[0]?.slug ?? "settings"}`,
              icon: UserCircle,
              visible: profileSubroutes.length > 0,
              items: profileSubroutes.map((subroute) => ({
                key: `profile-${subroute.slug}`,
                title: t(subroute.labelKey),
                href: `/profile/${subroute.slug}`,
                icon: subroute.slug === "connected-accounts" ? Mail : UserCircle,
                visible: true,
                badge: subroute.slug === "connected-accounts" ? channelsNeedingActionCount : undefined,
              })),
            },
            {
              key: "company",
              title: t("UserAvatar.company"),
              href: `/company/${companySubroutes[0]?.slug ?? "settings"}`,
              icon: Building,
              visible: companySubroutes.length > 0,
              items: companySubroutes.map((subroute) => ({
                key: `company-${subroute.slug}`,
                title: t(subroute.labelKey),
                href: `/company/${subroute.slug}`,
                icon: Building,
                visible: true,
              })),
            },
          ].filter((i) => i.visible),
        },
      ].filter((g) => g.items.length > 0);
    }, [
      t,
      rootStore.appMode,
      subscriptionStatus,
      userStore.user,
      systemTaskCount,
      unreadThreadCount,
      channelsNeedingActionCount,
    ]);

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

    const planSubtitle = buildPlanSubtitle(
      rootStore.appMode !== "self-hosted" ? subscriptionStatus : null,
      trialDaysLeft,
      emailVerified,
      t,
      router.push,
    );

    return (
      <>
        <Sidebar collapsible="icon" side="left" variant="inset">
          <NavHeader
            addLabel={t("Common.actions.add")}
            brandName="Customermates"
            brandSubtitle={planSubtitle}
            homeHref={rootStore.appMode === "demo" ? "https://customermates.com" : "/"}
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
              theme={resolvedTheme}
              user={user}
              onSignOut={() =>
                closeMobileSidebar(() => {
                  void signOutAction().then((res) => {
                    if (!res.ok) toastZodErrorTree(res.error);
                  });
                })
              }
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
  },
);

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
  const t = useTranslations();
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
  emailVerified: boolean | null,
  t: (key: string, values?: Record<string, string | number>) => string,
  navigate: (href: string) => void,
): React.ReactNode {
  const chipButton = (href: string, children: React.ReactNode) => (
    <button
      className="flex min-w-0 shrink rounded-md outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(href);
      }}
    >
      {children}
    </button>
  );

  const planChip = (() => {
    if (!status) return null;

    if (status === "active") {
      return chipButton(
        "/company/subscription",
        <AppChip className="h-[16px] px-1 text-[10px]" variant="success">
          {t("Subscription.status.active")}
        </AppChip>,
      );
    }

    if (status === "trial") {
      const text =
        trialDaysLeft != null
          ? t("Subscription.status.trialDaysLeft", { days: trialDaysLeft })
          : t("Subscription.status.trial");
      const variant = trialDaysLeft != null && trialDaysLeft <= 3 ? "warning" : "success";
      return chipButton(
        "/company/subscription",
        <AppChip className="h-[16px] px-1 text-[10px]" variant={variant}>
          {text}
        </AppChip>,
      );
    }

    return chipButton(
      "/company/subscription",
      <AppChip className="h-[16px] px-1 text-[10px]" variant="destructive">
        {t(`Subscription.status.${status}`)}
      </AppChip>,
    );
  })();

  const verificationChip =
    emailVerified === false
      ? chipButton(
          "/profile/settings",
          <AppChip className="h-[16px] px-1 text-[10px]" variant="warning">
            {t("EmailVerification.notVerified")}
          </AppChip>,
        )
      : null;

  if (!planChip && !verificationChip) return undefined;

  return (
    <>
      {planChip}

      {verificationChip}
    </>
  );
}
