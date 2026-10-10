"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";
import type { NavGroup } from "./navigation/nav-main";
import type { NavSecondaryItem } from "./navigation/nav-secondary";
import type { SidebarUser } from "./navigation/sidebar-user";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePathname as useIntlPathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import {
  Settings2,
  Settings,
  CreditCard,
  Inbox,
  Plus,
  LayoutGrid,
  Repeat,
  ShieldCheck,
  UserPlus,
  Users,
  RotateCcw,
  BookOpen,
  Trash2,
} from "lucide-react";
import { Action, Locale, Resource } from "@/generated/prisma";
import { DISPLAY_LANGUAGE_VALUES } from "@/i18n/user-locale";

import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AppLink } from "@/components/shared/app-link";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OVERLAY_SIDE_SHEET_CLASS, handOffSheet } from "@/components/ui/overlay-contract";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { Icon } from "@/components/shared/icon";
import { recordNavigationKey } from "@/features/records/record-navigation.schema";
import { assistantEntryVisible } from "./navigation/assistant-entry-visibility";
import { recordTypeIcon } from "@/components/records/record-type-icon";

import { NavHeader } from "./navigation/nav-header";
import { resolvePlanChip } from "./navigation/plan-subtitle";
import { OPERATOR_SUBROUTES } from "./navigation/operator-sections";
import { SETTINGS_SECTIONS, type SettingsSection, visibleSubroutes } from "./navigation/settings-sections";
import { SETTINGS_ENTRY_HREF, settingsHref } from "./navigation/settings-routes";
import { AreaNav, type AreaNavGroup } from "./navigation/area-nav";
import { NavSections, useResolvedSidebar } from "./navigation/nav-sections";
import { shortcutDestinations } from "./navigation/shortcut-destinations";
import { SidebarCustomize } from "./navigation/sidebar-customize";
import { useAccountActions } from "./navigation/use-account-actions";
import { NavSecondary } from "./navigation/nav-secondary";
import { NavUser } from "./navigation/nav-user";
import { LegalUpdateAlert } from "./navigation/legal-update-alert";
import { sidebarUserCanAccess } from "./navigation/sidebar-user";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { startBackgroundPoll } from "@/core/utils/background-poll";

const UNREAD_REFRESH_INTERVAL_MS = 10000;

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
    const searchParams = useSearchParams();
    const intlPathname = useIntlPathname();
    const router = useRouter();
    const rootStore = useRootStore();
    const { addPickerStore, globalSearchModalStore, keyboardShortcutsStore, recordWorkspaceStore, userStore } =
      rootStore;
    const { messagingThreadsStore } = rootStore;
    const isDocsRoute = pathname.split("/")[2] === "docs";
    const inboxVisible =
      !restricted &&
      !isDocsRoute &&
      rootStore.appMode !== "self-hosted" &&
      sidebarUserCanAccess(user, Resource.inboxMessages);
    const currentUnreadThreadCount = inboxVisible ? (messagingThreadsStore.unreadThreadCount ?? unreadThreadCount) : 0;
    const onInbox = intlPathname === "/inbox";

    const { isMobile, setOpenMobile } = useSidebar();
    const { theme, changeTheme, signOut, inviteMembers, sendFeedback } = useAccountActions(restricted);
    const subscriptionStatus = subscription?.status ?? null;
    const subscriptionPlan = subscription?.plan ?? null;
    const [selectedKey, setSelectedKey] = useState<string | null>(recordNavigationKey(intlPathname));

    const area = restricted ? null : areaOf(intlPathname, operatorConsoleVisible);
    const [lastWorkPath, setLastWorkPath] = useState("/dashboard");
    const [customizeOpen, setCustomizeOpen] = useState(false);
    useEffect(() => {
      if (!area) setLastWorkPath(`${intlPathname}${window.location.search}`);
    }, [area, intlPathname, searchParams]);

    function recheckAccountState() {
      router.push("/dashboard");
    }

    useEffect(() => setSelectedKey(recordNavigationKey(intlPathname)), [intlPathname]);

    useEffect(() => {
      if (!inboxVisible) return;
      return startBackgroundPoll({
        refresh: () => messagingThreadsStore.refreshUnreadCount(),
        onError: reportApplicationError,
        intervalMs: UNREAD_REFRESH_INTERVAL_MS,
        immediate: true,
        repeat: !onInbox,
      });
    }, [inboxVisible, onInbox, messagingThreadsStore]);

    function closeMobileSidebar(cb?: () => void) {
      if (isMobile) setOpenMobile(false);
      cb?.();
    }

    const navGroups: NavGroup[] = useMemo(() => {
      const canAccess = (resource: Resource) => sidebarUserCanAccess(user, resource);

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
              key: "wiki",
              title: t("NavigationBar.wiki"),
              href: "/wiki",
              icon: BookOpen,
              visible: canAccess(Resource.wiki),
            },
            {
              key: "inbox",
              title: t("NavigationBar.inbox"),
              href: "/inbox",
              icon: Inbox,
              visible: canAccess(Resource.inboxMessages) && rootStore.appMode !== "self-hosted",
              badge: currentUnreadThreadCount,
            },
            {
              key: "routines",
              title: t("NavigationBar.routines"),
              href: "/routines",
              icon: Repeat,
              visible: rootStore.appMode !== "self-hosted" && canAccess(Resource.routines),
            },
            {
              key: "trash",
              title: t("NavigationBar.trash"),
              href: "/trash",
              icon: Trash2,
              visible: true,
            },
          ].filter((i) => i.visible),
        },
        {
          key: "data",
          label: t("NavigationBar.data"),
          items: [
            ...(recordWorkspaceStore.navigation?.types ?? []).map((type) => ({
              key: `records:${type.id}`,
              title: type.pluralLabel,
              href: `/records/${type.id}`,
              icon: recordTypeIcon(type.icon),
              visible: true,
              badge: type.hasAuthorizationTasks ? systemTaskCount : undefined,
            })),
            ...(recordWorkspaceStore.navigation?.canManageSchema
              ? [
                  {
                    key: "configure-records",
                    title: t("RecordModel.configure"),
                    href: "/configure",
                    icon: Settings2,
                    visible: true,
                  },
                ]
              : []),
          ],
        },
      ].filter((g) => g.items.length > 0);
    }, [t, recordWorkspaceStore.navigation, rootStore.appMode, user, systemTaskCount, currentUnreadThreadCount]);

    const areaGroups: AreaNavGroup[] = useMemo(() => {
      if (area === "operator") {
        return [
          {
            key: "operator",
            label: t("NavigationBar.operator"),
            items: OPERATOR_SUBROUTES.map((subroute) => ({
              key: `operator-${subroute.slug}`,
              title: t(subroute.labelKey),
              href: `/operator/${subroute.slug}`,
              icon: subroute.icon,
            })),
          },
        ];
      }
      if (area !== "settings") return [];
      const canAccess = (resource: Resource) => sidebarUserCanAccess(user, resource);
      return (Object.keys(SETTINGS_SECTIONS) as SettingsSection[])
        .map((section) => ({
          key: section,
          label: section === "account" ? t("SettingsNav.account") : t("SettingsNav.workspace"),
          items: visibleSubroutes(section, rootStore.appMode, canAccess).map((subroute) => ({
            key: `settings-${subroute.slug}`,
            title: t(subroute.labelKey),
            href: settingsHref(subroute.slug),
            icon: subroute.icon,
            badge: subroute.slug === "channels" ? channelsNeedingActionCount : undefined,
          })),
        }))
        .filter((group) => group.items.length > 0);
    }, [area, t, user, rootStore.appMode, channelsNeedingActionCount]);

    const resolvedSidebar = useResolvedSidebar(navGroups);

    useEffect(
      () => keyboardShortcutsStore.setDestinations(shortcutDestinations(navGroups, resolvedSidebar)),
      [keyboardShortcutsStore, navGroups, resolvedSidebar],
    );

    const secondaryItems: NavSecondaryItem[] =
      recordWorkspaceStore.navigationRefreshFailed && !restricted
        ? [
            {
              key: "record-navigation-retry",
              title: t("RecordModel.reloadLists"),
              icon: RotateCcw,
              onSelect: () => runUserAction(recordWorkspaceStore.refreshNavigation),
            },
          ]
        : [];

    function openFeedback(invoker: HTMLElement) {
      closeMobileSidebar(() => sendFeedback(invoker, document.getElementById("sidebar-trigger")));
    }

    const addItems: AddPickerItem[] = (recordWorkspaceStore.navigation?.types ?? [])
      .filter((type) => type.canCreate)
      .map((type) => ({
        key: `add:${type.id}`,
        label: t("NavigationBar.addEntity", { entity: type.label }),
        typeId: type.id,
      }));
    if (recordWorkspaceStore.navigation?.canManageSchema)
      addItems.push({ key: "create-list", label: t("RecordModel.createList"), typeId: null });

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
    const planChip = resolvePlanChip(
      {
        status: isCloudHosted ? subscriptionStatus : null,
        plan: isCloudHosted ? subscriptionPlan : null,
        trialDaysLeft,
      },
      t,
    );
    const planChipNode = planChip ? (
      <AppChip className="h-[16px] px-1 text-[10px]" variant={planChip.variant}>
        {planChip.label}
      </AppChip>
    ) : undefined;
    const canAccess = (resource: Resource) => sidebarUserCanAccess(user, resource);
    const workspaceRoutes = visibleSubroutes("workspace", rootStore.appMode, canAccess).map(
      (subroute) => subroute.slug,
    );
    const workspaceMenu = restricted ? null : (
      <>
        {userStore.can(Resource.users, Action.create) && (
          <DropdownMenuItem
            id="workspace-menu-invite"
            onSelect={() =>
              closeMobileSidebar(() => {
                inviteMembers();
              })
            }
          >
            <UserPlus />

            <span>{t("WorkspaceMenu.inviteMembers")}</span>
          </DropdownMenuItem>
        )}

        {workspaceRoutes.includes("members") && (
          <DropdownMenuItem asChild>
            <AppLink
              appearance="unstyled"
              href={settingsHref("members")}
              id="workspace-menu-members"
              onClick={() => closeMobileSidebar()}
            >
              <Users />

              <span>{t("SettingsNav.members")}</span>
            </AppLink>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <AppLink
            appearance="unstyled"
            href={SETTINGS_ENTRY_HREF}
            id="workspace-menu-settings"
            onClick={() => closeMobileSidebar()}
          >
            <Settings />

            <span>{t("NavigationBar.settings")}</span>
          </AppLink>
        </DropdownMenuItem>

        {workspaceRoutes.includes("billing") && (
          <DropdownMenuItem asChild>
            <AppLink
              appearance="unstyled"
              href={settingsHref("billing")}
              id="workspace-menu-billing"
              onClick={() => closeMobileSidebar()}
            >
              <CreditCard />

              <span className="flex-1">{t("SettingsNav.billing")}</span>

              {planChipNode}
            </AppLink>
          </DropdownMenuItem>
        )}

        {operatorConsoleVisible && (
          <>
            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <AppLink
                appearance="unstyled"
                href={`/operator/${OPERATOR_SUBROUTES[0]?.slug ?? "overview"}`}
                id="workspace-menu-operator"
                onClick={() => closeMobileSidebar()}
              >
                <ShieldCheck />

                <span>{t("NavigationBar.operator")}</span>
              </AppLink>
            </DropdownMenuItem>
          </>
        )}
      </>
    );

    return (
      <>
        <Sidebar collapsible="icon" side="left" variant="inset">
          <NavHeader
            addLabel={t("Common.actions.add")}
            assistantBusy={assistantBusy}
            assistantBusyLabel={assistantBusyLabel}
            assistantLabel={
              assistantEntryVisible({
                agentChatEnabled: rootStore.agentChatEnabled,
                restricted,
                configEnabled: rootStore.agentChatStore.enabled,
                subscription,
              })
                ? t("AgentChat.askAi")
                : undefined
            }
            brandName="Customermates"
            logoAlt={t("Common.imageAlt.logo")}
            overlaysDisabled={!restricted && !recordWorkspaceStore.routeReady(intlPathname)}
            quickActions={!area}
            searchLabel={t("NavigationBar.search")}
            workspaceMenu={workspaceMenu}
            workspaceMenuLabel={t("WorkspaceMenu.label")}
            onAdd={(invoker) => {
              if (restricted) {
                closeMobileSidebar(recheckAccountState);
                return;
              }

              closeMobileSidebar(() => addPickerStore.openFrom(invoker, document.getElementById("sidebar-trigger")));
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

            {area ? (
              <AreaNav
                area={area === "settings" ? t("NavigationBar.settings") : t("NavigationBar.operator")}
                backHref={lastWorkPath}
                backLabel={t("Common.actions.back")}
                groups={areaGroups}
                pathname={intlPathname}
                onNavigate={() => closeMobileSidebar()}
              />
            ) : (
              <NavSections
                customizable={!restricted}
                groups={navGroups}
                pathname={intlPathname}
                selectedKey={restricted ? null : selectedKey}
                onNavigate={(key) => closeMobileSidebar(restricted ? undefined : () => setSelectedKey(key))}
              />
            )}

            {secondaryItems.length > 0 && <NavSecondary className="mt-auto" items={secondaryItems} />}
          </SidebarContent>

          <SidebarFooter>
            <NavUser
              customizable={!area}
              docsHref="/docs"
              emailVerified={emailVerified}
              labels={{
                menu: t("UserAvatar.menu"),
                profile: t("SettingsNav.profile"),
                notVerified: t("EmailVerification.notVerified"),
                theme: t("UserAvatar.theme"),
                themes: {
                  system: t("Common.themes.system"),
                  light: t("Common.themes.light"),
                  dark: t("Common.themes.dark"),
                },
                language: t("UserAvatar.language"),
                documentation: t("UserAvatar.documentation"),
                feedback: t("UserAvatar.sendFeedback"),
                customizeSidebar: t("SidebarCustomize.title"),
                signOut: t("UserAvatar.signOut"),
                keyboardShortcuts: t("KeyboardShortcuts.title"),
              }}
              language={userStore.user?.displayLanguage ?? Locale.system}
              languages={DISPLAY_LANGUAGE_VALUES.map((value) => ({
                value,
                label: value === Locale.system ? t("Common.locales.system") : t(`Common.locales.${value}`),
              }))}
              profileHref={settingsHref("profile")}
              restricted={restricted}
              theme={theme === "light" || theme === "dark" ? theme : "system"}
              user={user}
              onCustomizeSidebar={() => closeMobileSidebar(() => setCustomizeOpen(true))}
              onFeedback={openFeedback}
              onKeyboardShortcuts={
                restricted
                  ? undefined
                  : (invoker) =>
                      closeMobileSidebar(() =>
                        keyboardShortcutsStore.openFrom(
                          invoker ?? document.body,
                          document.getElementById("sidebar-trigger"),
                        ),
                      )
              }
              onLanguageChange={(value) =>
                closeMobileSidebar(() =>
                  runUserAction(() =>
                    userStore.updateDisplayLanguage(value as Locale, `${intlPathname}${window.location.search}`),
                  ),
                )
              }
              onNavigate={() => closeMobileSidebar()}
              onSignOut={() =>
                closeMobileSidebar(() => {
                  signOut();
                })
              }
              onThemeChange={changeTheme}
            />
          </SidebarFooter>
        </Sidebar>

        {!restricted && <SidebarCustomize groups={navGroups} open={customizeOpen} onOpenChange={setCustomizeOpen} />}

        {!restricted ? (
          <AddPickerDrawer
            items={addItems}
            open={addPickerStore.isOpen}
            returnFocusFallback={addPickerStore.focusReturnFallback}
            returnFocusTarget={addPickerStore.focusReturnTarget}
            onOpenChange={(open) => {
              if (!open) addPickerStore.close();
            }}
            onPick={(item) => {
              const { focusReturnTarget, focusReturnFallback } = addPickerStore;
              addPickerStore.close();
              if (item.typeId)
                recordWorkspaceStore.open({ typeId: item.typeId }, focusReturnTarget, focusReturnFallback);
              else router.push("/configure?create=true");
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
  typeId: string | null;
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
  onPick: (item: AddPickerItem) => void;
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
      <SheetContent className={OVERLAY_SIDE_SHEET_CLASS} {...focusReturn} onCloseAutoFocus={handleCloseAutoFocus}>
        <SheetHeader className="px-6">
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
                if (item.typeId) handOffSheet();
                onPick(item);
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

function areaOf(pathname: string, operatorConsoleVisible: boolean): "settings" | "operator" | null {
  const first = pathname.split("/")[1];
  if (first === "settings") return "settings";
  if (first === "operator" && operatorConsoleVisible) return "operator";
  return null;
}
