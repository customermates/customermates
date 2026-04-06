"use client";

import type { ExtendedUser } from "@/features/user/user.service";
import type { UpdateUserSettingsData } from "@/features/user/upsert/update-user-settings.interactor";
import type { Key } from "react";

import { useEffect, useMemo, useState } from "react";
import { Kbd } from "@heroui/kbd";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Button } from "@heroui/button";
import {
  BriefcaseIcon,
  BuildingOfficeIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Squares2X2Icon,
  StarIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { User } from "@heroui/user";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownSection } from "@heroui/dropdown";
import { Avatar } from "@heroui/avatar";
import { cn } from "@heroui/theme";

import { Resource } from "@/generated/prisma";
import type { Company, Theme } from "@/generated/prisma";

import { SidebarFrame } from "./navigation/sidebar-frame";

import { useRootStore } from "@/core/stores/root-store.provider";
import { XLink } from "@/components/x-link";
import { XIcon } from "@/components/x-icon";
import { XBadge } from "@/components/x-badge";
import { XDropdownItem } from "@/components/x-inputs/x-dropdown-item";
import { signOutAction } from "@/app/[locale]/actions";
import { XImage } from "@/components/x-image";
import { XThemeSwitcher } from "@/components/x-theme-switcher";
import { updateThemeAction } from "@/app/[locale]/(protected)/dashboard/actions";
import { FeedbackType } from "@/features/feedback/send-feedback.schema";
import { AiAgentProvisionModal } from "@/app/components/ai-agent-provision-modal";
import { AiAgentEnvironmentVariableModal } from "@/app/components/ai-agent-environment-variable-modal";

type AuthItem = {
  key: string;
  title: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  visible: boolean;
};

type Props = {
  systemTaskCount: number;
  user: ExtendedUser | null;
  company: Company | null;
  subscriptionPlan: "basic" | "pro" | null;
};

export const AppSidebar = observer(({ user, systemTaskCount, company, subscriptionPlan }: Props) => {
  const t = useTranslations("");
  const pathname = usePathname();
  const rootStore = useRootStore();
  const {
    userStore,
    companyStore,
    layoutStore,
    globalSearchModalStore,
    contactModalStore,
    organizationModalStore,
    dealModalStore,
    serviceModalStore,
    taskModalStore,
    feedbackModalStore,
    deleteConfirmationModalStore,
  } = rootStore;

  const isDocsRoute = pathname.split("/")[2] === "docs";
  const [selectedKey, setSelectedKey] = useState<string | null>(pathname.split("/")[2]);
  const { appSidebarStore } = rootStore;

  const { isSidebarOpen } = layoutStore;
  const { firstName, lastName, avatarUrl, email } = user ?? {};
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const avatarSrc = avatarUrl ?? undefined;

  useEffect(() => setSelectedKey(pathname.split("/")[2] ?? null), [pathname]);

  useEffect(() => {
    if (
      !rootStore.isDemoMode &&
      rootStore.isCloudHosted &&
      subscriptionPlan === "pro" &&
      userStore.canManage(Resource.aiAgent)
    )
      void appSidebarStore.refreshAgentStatus();
  }, [subscriptionPlan, userStore.user, rootStore.isCloudHosted, rootStore.isDemoMode]);

  function getButtonClassName(additionalClasses?: string) {
    return cn(
      isSidebarOpen ? "justify-start mx-3 px-3 font-normal shrink-0" : "justify-center mx-2 shrink-0",
      additionalClasses,
    );
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

  const authItems = useMemo(
    (): AuthItem[] =>
      [
        {
          key: "ai-agent",
          title: t("NavigationBar.aiAgent"),
          icon: ChatBubbleLeftRightIcon,
          visible: rootStore.isCloudHosted && subscriptionPlan === "pro" && userStore.canManage(Resource.aiAgent),
        },
        {
          key: "dashboard",
          title: t("NavigationBar.dashboard"),
          icon: Squares2X2Icon,
          visible: true,
        },
        {
          key: "contacts",
          title: t("NavigationBar.contacts"),
          icon: UserGroupIcon,
          visible: userStore.canAccess(Resource.contacts),
        },
        {
          key: "organizations",
          title: t("NavigationBar.organizations"),
          icon: BuildingOfficeIcon,
          visible: userStore.canAccess(Resource.organizations),
        },
        {
          key: "deals",
          title: t("NavigationBar.deals"),
          icon: BriefcaseIcon,
          visible: userStore.canAccess(Resource.deals),
        },
        {
          key: "services",
          title: t("NavigationBar.services"),
          icon: StarIcon,
          visible: userStore.canAccess(Resource.services),
        },
        {
          key: "tasks",
          title: t("NavigationBar.tasks"),
          icon: CheckCircleIcon,
          visible: userStore.canAccess(Resource.tasks),
        },
      ].filter((i) => i.visible),
    [subscriptionPlan, userStore.user, rootStore.isCloudHosted, t],
  );

  useEffect(() => {
    userStore.setUser(user);
    if (company) companyStore.setCompany(company);
  }, [user, company]);

  function handleSidebarPress(callback?: () => void) {
    if (window.innerWidth < 768) layoutStore.setIsSidebarOpen(false);
    callback?.();
  }

  function onAiAgentAction(actionKey: Key) {
    handleSidebarPress();

    if (actionKey === "openControlUi") {
      void appSidebarStore.openControlUi();
      return;
    }

    if (actionKey === "addEnvironmentVariable") {
      rootStore.aiAgentEnvironmentVariableModalStore.open();
      return;
    }

    if (actionKey === "reset") {
      deleteConfirmationModalStore.onInitOrRefresh({
        title: t("AiAgent.resetConfirmTitle"),
        message: t("AiAgent.resetConfirmMessage"),
        onConfirm: () => void appSidebarStore.resetAgent(),
      });
      deleteConfirmationModalStore.open();
    }
  }

  async function handleThemeChange(theme: Theme) {
    if (!user) return;

    const settings: UpdateUserSettingsData = {
      theme,
      displayLanguage: user.displayLanguage,
      formattingLocale: user.formattingLocale,
      marketingEmails: user.marketingEmails,
    };

    const res = await updateThemeAction(settings);

    if (res.ok) userStore.updateUserSettings(res.data);
  }

  const addItemDropdownItems = [
    {
      resource: Resource.contacts,
      key: "add_contact",
      translationKey: "NavigationBar.addContact",
      onPress: () => handleSidebarPress(() => void contactModalStore.add()),
    },
    {
      resource: Resource.organizations,
      key: "add_organization",
      translationKey: "NavigationBar.addOrganization",
      onPress: () => handleSidebarPress(() => void organizationModalStore.add()),
    },
    {
      resource: Resource.deals,
      key: "add_deal",
      translationKey: "NavigationBar.addDeal",
      onPress: () => handleSidebarPress(() => void dealModalStore.add()),
    },
    {
      resource: Resource.services,
      key: "add_service",
      translationKey: "NavigationBar.addService",
      onPress: () => handleSidebarPress(() => void serviceModalStore.add()),
    },
    {
      resource: Resource.tasks,
      key: "add_task",
      translationKey: "NavigationBar.addTask",
      onPress: () => handleSidebarPress(() => void taskModalStore.add()),
    },
  ];

  const overviewItemOrder = ["dashboard", "ai-agent", "tasks"] as const;
  const crmItemOrder = ["contacts", "organizations", "deals", "services"] as const;
  const overviewItems = overviewItemOrder
    .map((key) => authItems.find((item) => item.key === key))
    .filter((item): item is AuthItem => Boolean(item));
  const crmItems = crmItemOrder
    .map((key) => authItems.find((item) => item.key === key))
    .filter((item): item is AuthItem => Boolean(item));

  function renderAuthItem(item: AuthItem) {
    const isSelected = selectedKey === item.key;
    const iconContent = (
      <XIcon
        className={cn(isSelected ? "text-foreground" : "text-default-900 dark:text-default-800")}
        icon={item.icon}
      />
    );

    if (item.key === "ai-agent") {
      const showProvision = appSidebarStore.agentProvisioned !== true;
      const showManageActions = appSidebarStore.agentProvisioned === true;
      const aiAgentDropdownItems = [];
      if (showManageActions) {
        aiAgentDropdownItems.push(
          XDropdownItem({
            key: "openControlUi",
            children: t("AiAgent.openControlUi"),
          }),
        );
        aiAgentDropdownItems.push(
          XDropdownItem({
            key: "addEnvironmentVariable",
            children: t("AiAgent.addEnvironmentVariable"),
          }),
        );
        aiAgentDropdownItems.push(
          XDropdownItem({
            key: "reset",
            color: "danger",
            className: "text-danger border-danger",
            children: t("AiAgent.reset"),
          }),
        );
      }

      if (showProvision) {
        return (
          <Button
            key={item.key}
            className={getNavItemClassName(isSelected)}
            isDisabled={appSidebarStore.agentBooting}
            isIconOnly={!isSidebarOpen}
            isLoading={appSidebarStore.agentBooting}
            startContent={isSidebarOpen && !appSidebarStore.agentBooting ? iconContent : null}
            variant="light"
            onPress={() =>
              handleSidebarPress(() => {
                rootStore.aiAgentProvisionModalStore.onInitOrRefresh({ openaiApiKey: "", anthropicApiKey: "" });
                rootStore.aiAgentProvisionModalStore.open();
              })
            }
          >
            {isSidebarOpen ? (
              <span
                className={cn(
                  "tracking-normal text-sm font-normal",
                  isSelected ? "text-foreground" : "text-default-900 dark:text-default-800",
                )}
              >
                {item.title}
              </span>
            ) : !appSidebarStore.agentBooting ? (
              iconContent
            ) : null}
          </Button>
        );
      }

      return (
        <Dropdown key={item.key}>
          <DropdownTrigger>
            <Button
              className={getNavItemClassName(isSelected)}
              isDisabled={appSidebarStore.agentBooting}
              isIconOnly={!isSidebarOpen}
              isLoading={appSidebarStore.agentBooting}
              startContent={isSidebarOpen && !appSidebarStore.agentBooting ? iconContent : null}
              variant="light"
            >
              {isSidebarOpen ? (
                <span
                  className={cn(
                    "tracking-normal text-sm font-normal",
                    isSelected ? "text-foreground" : "text-default-900 dark:text-default-800",
                  )}
                >
                  {item.title}
                </span>
              ) : !appSidebarStore.agentBooting ? (
                iconContent
              ) : null}
            </Button>
          </DropdownTrigger>

          <DropdownMenu aria-label={t("NavigationBar.aiAgent")} onAction={onAiAgentAction}>
            {aiAgentDropdownItems}
          </DropdownMenu>
        </Dropdown>
      );
    }

    return (
      <Button
        key={item.key}
        as={XLink}
        className={getNavItemClassName(isSelected)}
        href={`/${item.key}`}
        isIconOnly={!isSidebarOpen}
        startContent={isSidebarOpen ? iconContent : null}
        variant="light"
        onPress={() =>
          handleSidebarPress(() => {
            setSelectedKey(item.key);
          })
        }
      >
        {isSidebarOpen ? (
          <span
            className={cn(
              "tracking-normal text-sm font-normal",
              isSelected ? "text-foreground" : "text-default-900 dark:text-default-800",
            )}
          >
            {item.title}
          </span>
        ) : (
          iconContent
        )}
      </Button>
    );
  }

  const sidebarContent = (
    <>
      <Button
        as={XLink}
        className={cn("mb-4 font-normal", isSidebarOpen ? "justify-start mx-3 px-3" : "mx-2")}
        href={rootStore.isDemoMode ? "https://customermates.com" : "/"}
        isIconOnly={!isSidebarOpen}
        variant="light"
        onPress={() => handleSidebarPress()}
      >
        <XImage
          alt={t("Common.imageAlt.logo")}
          className="object-contain select-none"
          height={24}
          loading="eager"
          src={isSidebarOpen ? "customermates.svg" : "customermates-square.svg"}
          width={isSidebarOpen ? 140 : 24}
        />
      </Button>

      <nav className="min-h-0 flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
        <Button
          className={
            isSidebarOpen ? getButtonClassName("h-9 rounded-lg border border-divider") : getButtonClassName("h-9")
          }
          isIconOnly={!isSidebarOpen}
          startContent={
            isSidebarOpen ? (
              <XIcon className="text-default-900 dark:text-default-800" icon={MagnifyingGlassIcon} />
            ) : null
          }
          variant="light"
          onPress={() => handleSidebarPress(() => globalSearchModalStore.open())}
        >
          {isSidebarOpen ? (
            <div className="flex items-center justify-between w-full">
              <span className="tracking-normal text-sm font-medium text-default-900 dark:text-default-800">
                {t("NavigationBar.search")}
              </span>

              <Kbd className="text-sm text-subdued shadow-none" keys={["command"]}>
                K
              </Kbd>
            </div>
          ) : (
            <XIcon icon={MagnifyingGlassIcon} />
          )}
        </Button>

        <Dropdown>
          <DropdownTrigger>
            <Button
              className={getButtonClassName("h-9 rounded-lg")}
              isIconOnly={!isSidebarOpen}
              startContent={isSidebarOpen ? <XIcon icon={PlusIcon} /> : null}
              variant="light"
            >
              {isSidebarOpen ? (
                <span className="tracking-normal text-sm font-normal text-default-900 dark:text-default-800">
                  {t("Common.actions.add")}
                </span>
              ) : (
                <XIcon icon={PlusIcon} />
              )}
            </Button>
          </DropdownTrigger>

          <DropdownMenu>
            {addItemDropdownItems.map((item) =>
              userStore.canManage(item.resource)
                ? XDropdownItem({
                    key: item.key,
                    children: t(item.translationKey),
                    onPress: item.onPress,
                  })
                : null,
            )}
          </DropdownMenu>
        </Dropdown>

        {overviewItems.length > 0 && isSidebarOpen && (
          <div className="mx-3 mt-2 px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-subdued">
            Overview
          </div>
        )}

        {overviewItems.map(renderAuthItem)}

        {crmItems.length > 0 && isSidebarOpen && (
          <div className="mx-3 mt-2 px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-subdued">CRM</div>
        )}

        {crmItems.map(renderAuthItem)}
      </nav>

      <div
        className={cn("mt-auto flex gap-2 w-full", isSidebarOpen ? "justify-between px-3" : "px-2 flex-col-reverse")}
      >
        <Dropdown>
          <XBadge
            borderColor="content1"
            color="warning"
            content={systemTaskCount}
            isInvisible={systemTaskCount === 0}
            size="md"
          >
            <DropdownTrigger>
              <Button
                className={isSidebarOpen ? "px-3" : ""}
                isIconOnly={!isSidebarOpen}
                radius="lg"
                size={isSidebarOpen ? "lg" : "md"}
                variant={["profile", "company"].includes(selectedKey ?? "") ? "flat" : "light"}
              >
                {isSidebarOpen ? (
                  <User
                    avatarProps={{
                      isBordered: true,
                      size: "sm",
                      src: avatarSrc,
                      name: name,
                      color: ["profile", "company"].includes(selectedKey ?? "") ? "primary" : "default",
                      alt: t("Common.imageAlt.avatar", { name }),
                    }}
                    classNames={{
                      description: "truncate max-w-26 text-subdued text-xs",
                      name: "truncate max-w-26 text-xs text-default-800 dark:text-default-700",
                    }}
                    description={email ?? ""}
                    name={name}
                  />
                ) : (
                  <Avatar
                    isBordered
                    alt={t("Common.imageAlt.avatar", { name })}
                    color={["profile", "company"].includes(selectedKey ?? "") ? "primary" : "default"}
                    name={name}
                    radius="lg"
                    size="sm"
                    src={avatarSrc}
                  />
                )}
              </Button>
            </DropdownTrigger>
          </XBadge>

          <DropdownMenu>
            <DropdownSection showDivider>
              {XDropdownItem({
                key: "theme_switcher",
                className: "px-2 py-1.5",
                children: t("UserAvatar.theme"),
                endContent: <XThemeSwitcher onThemeChange={handleThemeChange} />,
              })}

              {XDropdownItem({
                key: "profile",
                as: XLink,
                className: cn("text-inherit", selectedKey === "profile" && "bg-default/40"),
                href: "/profile",
                children: t("UserAvatar.profile"),
                onPress: () => handleSidebarPress(),
              })}

              {userStore.canAccess(Resource.company)
                ? XDropdownItem({
                    key: "company",
                    as: XLink,
                    className: cn("text-inherit", selectedKey === "company" && "bg-default/40"),
                    href: "/company",
                    children: (
                      <div className="flex items-center gap-2">
                        <span>{t("UserAvatar.company")}</span>

                        {systemTaskCount > 0 && <span className="rounded-full bg-warning/60 w-2 h-2 " />}
                      </div>
                    ),
                    onPress: () => handleSidebarPress(),
                  })
                : null}

              {XDropdownItem({
                key: "docs",
                as: XLink,
                className: "text-inherit",
                href: "/docs",
                children: t("UserAvatar.documentation"),
                onPress: () => handleSidebarPress(),
              })}

              {XDropdownItem({
                key: "feedback",
                startContent: <XIcon icon={ChatBubbleLeftRightIcon} />,
                children: t("Common.inputs.feedback"),
                onPress: () =>
                  handleSidebarPress(() => {
                    feedbackModalStore.onInitOrRefresh({ type: FeedbackType.general, feedback: "" });
                    feedbackModalStore.open();
                  }),
              })}
            </DropdownSection>

            <DropdownSection>
              {XDropdownItem({
                key: "logout",
                className: "text-danger border-danger",
                color: "danger",
                onPress: () => handleSidebarPress(() => void signOutAction()),
                children: t("UserAvatar.signOut"),
              })}
            </DropdownSection>
          </DropdownMenu>
        </Dropdown>

        <Button
          isIconOnly
          size={isSidebarOpen ? "lg" : "md"}
          variant="light"
          onPress={() => layoutStore.setIsSidebarOpen(!isSidebarOpen)}
        >
          <XIcon icon={isSidebarOpen ? ChevronLeftIcon : ChevronRightIcon} />
        </Button>
      </div>

      {rootStore.isCloudHosted && <AiAgentProvisionModal />}

      {rootStore.isCloudHosted && <AiAgentEnvironmentVariableModal />}
    </>
  );

  if (isDocsRoute) return null;

  return (
    <SidebarFrame
      desktopWidthClassName={layoutStore.isSidebarOpen ? "md:w-64" : "md:w-14"}
      isMobileOpen={layoutStore.isSidebarOpen}
      onMobileClose={() => layoutStore.setIsSidebarOpen(false)}
      onMobileOpen={() => layoutStore.setIsSidebarOpen(true)}
    >
      {sidebarContent}
    </SidebarFrame>
  );
});
