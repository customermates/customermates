"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";
import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { NavGroup } from "./navigation/nav-main";
import type { NavSecondaryItem } from "./navigation/nav-secondary";
import type { SidebarUser } from "./navigation/sidebar-user";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
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
  Repeat,
  ShieldCheck,
  TrendingUp,
  UserCircle,
  Users,
} from "lucide-react";
import { Resource, Theme as ThemeEnum } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { AppChip } from "@/components/chip/app-chip";
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { Icon } from "@/components/shared/icon";
import { signOutAction } from "@/app/[locale]/actions";
import { FeedbackType } from "@/features/feedback/send-feedback.schema";
import { EntityType } from "@/generated/prisma";

import { NavHeader } from "./navigation/nav-header";
import { resolvePlanChip } from "./navigation/plan-subtitle";
import { OPERATOR_SUBROUTES } from "./navigation/operator-sections";
import { visibleSubroutes } from "./navigation/workspace-sections";
import { NavMain } from "./navigation/nav-main";
import { NavSecondary } from "./navigation/nav-secondary";
import { NavUser } from "./navigation/nav-user";
import { LegalUpdateAlert } from "./navigation/legal-update-alert";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { sidebarUserCanAccess, sidebarUserCanManage } from "./navigation/sidebar-user";
import { runUserAction } from "@/core/errors/report-application-error";

type FullProps = {
  systemTaskCount: number;
  unreadThreadCount: number;
  channelsNeedingActionCount: number;
  user: SidebarUser | null;
  subscription: SubscriptionDto | null;
  trialDaysLeft: number | null;
  emailVerified: boolean | null;
  legalStatus: LegalUpdateStatus | null;
  operatorConsoleVisible: boolean;
};

type Props = ({ mode: "full" } & FullProps) | { mode: "restricted"; user: SidebarUser };

type SidebarContentProps = FullProps & {
  restricted: boolean;
};

export function AppSidebar(props: Props) {
  if (props.mode === "restricted") {
    return (
      <FullAppSidebar
        restricted
        channelsNeedingActionCount={0}
        emailVerified={null}
        legalStatus={null}
        operatorConsoleVisible={false}
        subscription={null}
        systemTaskCount={0}
        trialDaysLeft={null}
        unreadThreadCount={0}
        user={props.user}
      />
    );
  }

  return (
    <FullAppSidebar
      channelsNeedingActionCount={props.channelsNeedingActionCount}
      emailVerified={props.emailVerified}
      legalStatus={props.legalStatus}
      operatorConsoleVisible={props.operatorConsoleVisible}
      restricted={false}
      subscription={props.subscription}
      systemTaskCount={props.systemTaskCount}
      trialDaysLeft={props.trialDaysLeft}
      unreadThreadCount={props.unreadThreadCount}
      user={props.user}
    />
  );
}

const FullAppSidebar = observer(
  ({
    user,
    systemTaskCount,
    unreadThreadCount,
    channelsNeedingActionCount,
    subscription,
    trialDaysLeft,
    emailVerified,
    legalStatus,
    operatorConsoleVisible,
    restricted,
  }: SidebarContentProps) => {
    const t = useTranslations();
    const pathname = usePathname();
    const intlPathname = useIntlPathname();
    const router = useRouter();
    const rootStore = useRootStore();
    const { feedbackModalStore, globalSearchModalStore, terminologyStore, userStore } = rootStore;
    const { singular, plural } = useEntityTerminology();

    const { isMobile, setOpenMobile } = useSidebar();
    const { resolvedTheme, setTheme } = useTheme();
    const openEntity = useOpenEntity();
    const subscriptionStatus = subscription?.status ?? null;
    const subscriptionPlan = subscription?.plan ?? null;
    const isDocsRoute = pathname.split("/")[2] === "docs";
    const [selectedKey, setSelectedKey] = useState<string | null>(pathname.split("/")[2]);
    const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
    const addPickerInvokerRef = useRef<HTMLElement | null>(null);
    const addPickerFallbackRef = useRef<HTMLElement | null>(null);

    function handleThemeChange() {
      const next = resolvedTheme === "dark" ? ThemeEnum.light : ThemeEnum.dark;
      setTheme(next);
      if (!restricted) runUserAction(() => userStore.updateTheme(next));
    }

    async function handleSignOut() {
      const res = await signOutAction();
      if (!res.ok) toastZodErrorTree(res.error);
    }

    function recheckAccountState() {
      router.push("/dashboard");
    }

    useEffect(() => setSelectedKey(pathname.split("/")[2] ?? null), [pathname]);

    function closeMobileSidebar(cb?: () => void) {
      if (isMobile) setOpenMobile(false);
      cb?.();
    }

    const navGroups: NavGroup[] = useMemo(() => {
      const canAccess = (resource: Resource) => sidebarUserCanAccess(user, resource);
      const profileSubroutes = visibleSubroutes("profile", rootStore.appMode, canAccess);
      const companySubroutes = visibleSubroutes("company", rootStore.appMode, canAccess);

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
              visible: canAccess(Resource.inboxMessages) && rootStore.appMode !== "self-hosted",
              badge: unreadThreadCount,
            },
            {
              key: "routines",
              title: t("NavigationBar.routines"),
              href: "/routines",
              icon: Repeat,
              visible: rootStore.appMode !== "self-hosted",
            },
          ].filter((i) => i.visible),
        },
        {
          key: "crm",
          label: t("NavigationBar.crm"),
          items: [
            {
              key: "contacts",
              title: plural(EntityType.contact),
              href: "/contacts",
              icon: Users,
              visible: canAccess(Resource.contacts),
            },
            {
              key: "organizations",
              title: plural(EntityType.organization),
              href: "/organizations",
              icon: Building2,
              visible: canAccess(Resource.organizations),
            },
            {
              key: "deals",
              title: plural(EntityType.deal),
              href: "/deals",
              icon: TrendingUp,
              visible: canAccess(Resource.deals),
            },
            {
              key: "services",
              title: plural(EntityType.service),
              href: "/services",
              icon: Package,
              visible: canAccess(Resource.services),
            },
            {
              key: "tasks",
              title: plural(EntityType.task),
              href: "/tasks",
              icon: CheckCircle2,
              visible: canAccess(Resource.tasks),
              badge: systemTaskCount,
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
        {
          key: "admin",
          label: t("NavigationBar.admin"),
          items: [
            {
              key: "operator",
              title: t("NavigationBar.operator"),
              href: `/operator/${OPERATOR_SUBROUTES[0]?.slug ?? "overview"}`,
              icon: ShieldCheck,
              visible: operatorConsoleVisible,
              items: OPERATOR_SUBROUTES.map((subroute) => ({
                key: `operator-${subroute.slug}`,
                title: t(subroute.labelKey),
                href: `/operator/${subroute.slug}`,
                icon: ShieldCheck,
                visible: true,
              })),
            },
          ].filter((i) => i.visible),
        },
      ].filter((g) => g.items.length > 0);
    }, [
      operatorConsoleVisible,
      t,
      plural,
      terminologyStore.overrides,
      rootStore.appMode,
      subscriptionStatus,
      user,
      systemTaskCount,
      unreadThreadCount,
      channelsNeedingActionCount,
    ]);

    const secondaryItems: NavSecondaryItem[] = [
      {
        key: "documentation",
        title: t("UserAvatar.documentation"),
        icon: FileText,
        href: restricted ? "/dashboard" : "/docs",
      },
      {
        key: "feedback",
        title: t("Common.inputs.feedback"),
        icon: MessageCircle,
        onSelect: (invoker) => {
          if (restricted) {
            closeMobileSidebar(recheckAccountState);
            return;
          }

          closeMobileSidebar(() => {
            feedbackModalStore.onInitOrRefresh({
              type: FeedbackType.general,
              feedback: "",
            });
            const sidebarTrigger = document.getElementById("sidebar-trigger");
            feedbackModalStore.openFrom(invoker, sidebarTrigger);
          });
        },
      },
    ];

    const addItems = [
      {
        resource: Resource.contacts,
        key: "add_contact",
        label: t("NavigationBar.addEntity", {
          entity: singular(EntityType.contact),
        }),
        entity: EntityType.contact,
      },
      {
        resource: Resource.organizations,
        key: "add_organization",
        label: t("NavigationBar.addEntity", {
          entity: singular(EntityType.organization),
        }),
        entity: EntityType.organization,
      },
      {
        resource: Resource.deals,
        key: "add_deal",
        label: t("NavigationBar.addEntity", {
          entity: singular(EntityType.deal),
        }),
        entity: EntityType.deal,
      },
      {
        resource: Resource.services,
        key: "add_service",
        label: t("NavigationBar.addEntity", {
          entity: singular(EntityType.service),
        }),
        entity: EntityType.service,
      },
      {
        resource: Resource.tasks,
        key: "add_task",
        label: t("NavigationBar.addEntity", {
          entity: singular(EntityType.task),
        }),
        entity: EntityType.task,
      },
    ];

    if (isDocsRoute && !restricted) return null;

    const isCloudHosted = rootStore.appMode !== "self-hosted";
    const assistantRouteSyncStatus = rootStore.agentChatStore.routeSyncStatus;
    const assistantBusy = rootStore.agentChatStore.isWorking || assistantRouteSyncStatus !== "idle";
    const assistantBusyLabel = rootStore.agentChatStore.isWorking
      ? t("AgentChat.askAiWorking")
      : assistantRouteSyncStatus === "waiting"
        ? t("AgentChat.ui.routeSyncWaiting")
        : assistantRouteSyncStatus === "refreshing"
          ? t("AgentChat.ui.routeSyncRefreshing")
          : t("AgentChat.ui.finalizing");
    const planSubtitle = buildPlanSubtitle(
      isCloudHosted ? subscriptionStatus : null,
      isCloudHosted ? subscriptionPlan : null,
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
            assistantBusy={assistantBusy}
            assistantBusyLabel={assistantBusyLabel}
            assistantLabel={
              rootStore.agentChatEnabled && rootStore.agentChatStore.enabled === true ? t("AgentChat.askAi") : undefined
            }
            assistantShortcut="⌘J"
            brandName="Customermates"
            brandSubtitle={planSubtitle}
            homeHref={
              restricted ? "/dashboard" : rootStore.appMode === "demo" ? "https://customermates.com" : "/dashboard"
            }
            logoAlt={t("Common.imageAlt.logo")}
            searchLabel={t("NavigationBar.search")}
            onAdd={(invoker) => {
              if (restricted) {
                closeMobileSidebar(recheckAccountState);
                return;
              }

              closeMobileSidebar(() => {
                addPickerInvokerRef.current = invoker;
                addPickerFallbackRef.current = document.getElementById("sidebar-trigger");
                setIsAddPickerOpen(true);
              });
            }}
            onAssistant={() => {
              if (restricted) {
                closeMobileSidebar(recheckAccountState);
                return;
              }
              closeMobileSidebar(() => rootStore.agentChatStore.toggle());
            }}
            onSearch={(invoker) => {
              if (restricted) {
                closeMobileSidebar(recheckAccountState);
                return;
              }

              closeMobileSidebar(() => {
                const sidebarTrigger = document.getElementById("sidebar-trigger");
                globalSearchModalStore.openFrom(invoker, sidebarTrigger);
              });
            }}
          />

          <SidebarContent>
            {legalStatus ? <LegalUpdateAlert status={legalStatus} onNavigate={() => closeMobileSidebar()} /> : null}

            <NavMain
              groups={navGroups}
              pathname={intlPathname}
              selectedKey={restricted ? null : selectedKey}
              onNavigate={(key) => closeMobileSidebar(restricted ? undefined : () => setSelectedKey(key))}
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
                  runUserAction(handleSignOut);
                })
              }
              onThemeChange={handleThemeChange}
            />
          </SidebarFooter>
        </Sidebar>

        {!restricted ? (
          <AddPickerDrawer
            items={addItems.filter((item) => sidebarUserCanManage(user, item.resource))}
            open={isAddPickerOpen}
            returnFocusFallback={addPickerFallbackRef.current}
            returnFocusTarget={addPickerInvokerRef.current}
            onOpenChange={setIsAddPickerOpen}
            onPick={(entity) => {
              startTransition(() => {
                setIsAddPickerOpen(false);
                openEntity(entity, "new", addPickerInvokerRef.current, addPickerFallbackRef.current);
              });
            }}
          />
        ) : null}
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
  returnFocusFallback,
  returnFocusTarget,
  onOpenChange,
  onPick,
}: {
  items: AddPickerItem[];
  open: boolean;
  returnFocusFallback: HTMLElement | null;
  returnFocusTarget: HTMLElement | null;
  onOpenChange: (o: boolean) => void;
  onPick: (entity: EntityType) => void;
}) {
  const t = useTranslations();
  const isHandingOffRef = useRef(false);
  const focusReturn = useOverlayFocusReturn(open, returnFocusTarget, returnFocusFallback);

  function handleCloseAutoFocus(event: Event) {
    if (isHandingOffRef.current) {
      isHandingOffRef.current = false;
      event.preventDefault();
      return;
    }

    focusReturn.onCloseAutoFocus(event);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="gap-0 sm:max-w-[420px]"
        side="left"
        {...focusReturn}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>{t("NavigationBar.addPickerTitle")}</SheetTitle>

          <SheetDescription>{t("NavigationBar.addPickerDescription")}</SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-1 py-4">
          {items.map((item) => (
            <button
              key={item.key}
              className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              type="button"
              onClick={() => {
                isHandingOffRef.current = true;
                onPick(item.entity);
              }}
            >
              <span>{item.label}</span>

              <Icon className="size-3.5 opacity-50" icon={Plus} />
            </button>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function buildPlanSubtitle(
  status: SubscriptionStatus | null,
  plan: SubscriptionPlan | null,
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

  const planModel = resolvePlanChip({ status, plan, trialDaysLeft }, t);
  const planChip = planModel
    ? chipButton(
        planModel.href,
        <AppChip className="h-[16px] px-1 text-[10px]" variant={planModel.variant}>
          {planModel.label}
        </AppChip>,
      )
    : null;

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
