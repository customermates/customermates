import type { AccountState } from "@/features/auth/account-state";
import type { PublicNavGroup } from "./public-navbar-menu";
import type { useTranslations } from "next-intl";

import { BookOpen, Bot, Boxes, Cable, HardDrive, Inbox, Linkedin, Plug, Server, Users, UsersRound } from "lucide-react";

import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

import { solutionNavLinks, solutionNavSections } from "./solution-nav";

type PublicNavbarCta = {
  href: string;
  label: "signIn" | "openApp" | "continueSetup";
};

type PublicNavbarActions = {
  cta: PublicNavbarCta | null;
  showContact: boolean;
  signOut: "hidden" | "default" | "setupEscape";
};

export function resolvePublicNavbarActions({
  accountState,
  hasValidSession,
  onboardingIntent,
  pathname,
}: {
  accountState: AccountState;
  hasValidSession: boolean;
  onboardingIntent?: string;
  pathname: string;
}): PublicNavbarActions {
  if (!hasValidSession) {
    return {
      cta:
        pathname === "/auth/signin"
          ? null
          : {
              href: onboardingIntent ? pathWithOnboardingIntent("/auth/signin", onboardingIntent) : "/auth/signin",
              label: "signIn",
            },
      showContact: true,
      signOut: "hidden",
    };
  }

  if (accountState === "unregistered") {
    const onboardingPath = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

    return {
      cta: onboardingPath
        ? null
        : {
            href: onboardingIntent ? pathWithOnboardingIntent("/onboarding", onboardingIntent) : "/onboarding",
            label: "continueSetup",
          },
      showContact: false,
      signOut: onboardingPath ? "setupEscape" : "hidden",
    };
  }

  const cta: PublicNavbarCta | null =
    accountState === "allowed" && pathname !== "/dashboard" ? { href: "/dashboard", label: "openApp" } : null;

  return {
    cta,
    showContact: true,
    signOut: "default",
  };
}

export function resolvePublicNavGroups(t: ReturnType<typeof useTranslations>, locale: string): PublicNavGroup[] {
  return [
    {
      activeHref: "/features",
      columns: 3,
      icon: Boxes,
      id: "product",
      links: [
        {
          icon: BookOpen,
          href: "/features/knowledge-base",
          title: t("NavigationBar.public.pillarKnowledge"),
          description: t("NavigationBar.public.pillarKnowledgeDescription"),
        },
        {
          icon: Users,
          href: "/features/contact-management",
          title: t("NavigationBar.public.pillarData"),
          description: t("NavigationBar.public.pillarDataDescription"),
        },
        {
          icon: Inbox,
          href: "/features/unified-inbox",
          title: t("NavigationBar.public.pillarInbox"),
          description: t("NavigationBar.public.pillarInboxDescription"),
        },
        {
          icon: Plug,
          href: "/features/integrations",
          title: t("NavigationBar.public.integrations"),
        },
        {
          icon: Server,
          href: "/features/open-source-crm",
          title: t("NavigationBar.public.cloudVsSelfHosted"),
        },
        {
          icon: HardDrive,
          href: "/features/self-hosted",
          title: t("NavigationBar.public.selfHosted"),
        },
        {
          icon: Boxes,
          href: "/features/all",
          title: t("NavigationBar.public.allFeatures"),
        },
      ],
      title: t("NavigationBar.public.product"),
    },
    {
      activeHref: "/for",
      columns: 2,
      icon: UsersRound,
      id: "solutions",
      links: solutionNavLinks(t, locale),
      sections: solutionNavSections(t),
      title: t("NavigationBar.public.solutions"),
    },
    {
      activeHref: "/features/claude-crm",
      columns: 3,
      icon: Bot,
      id: "ai-agents",
      links: [
        {
          href: "/features/claude-crm",
          mark: { kind: "agent", provider: "claude" },
          title: t("NavigationBar.public.claudeCrm"),
        },
        {
          icon: Linkedin,
          href: "/features/claude-linkedin",
          title: t("NavigationBar.public.claudeLinkedIn"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-custom-connector#chatgpt",
          mark: { kind: "agent", provider: "chatgpt" },
          title: t("NavigationBar.public.providerChatGPT"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-cli#codex",
          mark: { kind: "agent", provider: "codex" },
          title: t("NavigationBar.public.providerCodex"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-cli#gemini-cli",
          mark: { kind: "agent", provider: "gemini" },
          title: t("NavigationBar.public.providerGemini"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-cli#cursor",
          mark: { kind: "agent", provider: "cursor" },
          title: t("NavigationBar.public.providerCursor"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-custom-connector#grok-bot",
          mark: { kind: "agent", provider: "grok" },
          title: t("NavigationBar.public.providerGrok"),
        },
        {
          activeMatch: false,
          icon: Cable,
          href: "/docs/mcp",
          title: t("NavigationBar.public.mcpDocs"),
        },
        {
          icon: Bot,
          href: "/blog/agentic-crm",
          title: t("NavigationBar.public.agenticCrm"),
        },
      ],
      title: t("NavigationBar.public.aiAgents"),
    },
  ];
}
