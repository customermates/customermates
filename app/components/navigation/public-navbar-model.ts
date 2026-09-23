import type { AccountState } from "@/features/auth/account-state";
import type { PublicNavGroup } from "./public-navbar-menu";
import type { useTranslations } from "next-intl";

import {
  BookOpen,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Cable,
  CheckCircle2,
  GitCompareArrows,
  Github,
  HeartPulse,
  Inbox,
  LayoutGrid,
  Megaphone,
  Plug,
  Presentation,
  Rocket,
  Server,
  Store,
  TrendingUp,
  UserRoundSearch,
  Users,
  UsersRound,
} from "lucide-react";

import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

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

export function resolvePublicNavGroups(t: ReturnType<typeof useTranslations>): PublicNavGroup[] {
  return [
    {
      activeHref: "/features",
      columns: 3,
      icon: Boxes,
      id: "product",
      links: [
        {
          icon: Inbox,
          href: "/features/unified-inbox",
          title: t("NavigationBar.public.unifiedInbox"),
        },
        {
          icon: Users,
          href: "/features/contact-management",
          title: t("NavigationBar.public.contactManagement"),
        },
        {
          icon: TrendingUp,
          href: "/features/pipeline",
          title: t("NavigationBar.public.pipeline"),
        },
        {
          icon: TrendingUp,
          href: "/features/sales-tracking",
          title: t("NavigationBar.public.salesTracking"),
        },
        {
          icon: CheckCircle2,
          href: "/features/task-management",
          title: t("NavigationBar.public.taskManagement"),
        },
        {
          icon: LayoutGrid,
          href: "/features/cloud-crm",
          title: t("NavigationBar.public.cloudCrm"),
        },
        {
          icon: Server,
          href: "/features/self-hosted",
          title: t("NavigationBar.public.selfHosted"),
        },
        {
          activeMatch: false,
          icon: Cable,
          href: "/docs/mcp",
          title: t("NavigationBar.public.mcp"),
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
      columns: 3,
      icon: UsersRound,
      id: "solutions",
      links: [
        {
          icon: BriefcaseBusiness,
          href: "/for/professional-services",
          title: t("NavigationBar.public.professionalServices"),
        },
        {
          icon: Megaphone,
          href: "/for/agencies",
          title: t("NavigationBar.public.agencies"),
        },
        {
          icon: Presentation,
          href: "/for/consultants",
          title: t("NavigationBar.public.consultants"),
        },
        {
          icon: UserRoundSearch,
          href: "/for/recruiting",
          title: t("NavigationBar.public.recruiting"),
        },
        {
          icon: HeartPulse,
          href: "/for/healthcare",
          title: t("NavigationBar.public.healthcare"),
        },
        {
          icon: Building2,
          href: "/for/property-management",
          title: t("NavigationBar.public.propertyManagement"),
        },
        {
          icon: Rocket,
          href: "/for/startups",
          title: t("NavigationBar.public.startups"),
        },
        {
          icon: Store,
          href: "/for/smb",
          title: t("NavigationBar.public.smallBusiness"),
        },
        {
          icon: UsersRound,
          href: "/for",
          title: t("NavigationBar.public.allSolutions"),
        },
      ],
      title: t("NavigationBar.public.solutions"),
    },
    {
      activeHref: "/features/integrations",
      columns: 2,
      icon: Plug,
      id: "integrations",
      links: [
        {
          activeMatch: false,
          href: "/docs/connect-custom-connector#claude",
          mark: { kind: "agent", provider: "claude" },
          title: t("NavigationBar.public.providerClaude"),
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
          href: "/features/email-integration",
          mark: { kind: "channel", provider: "gmail" },
          title: t("NavigationBar.public.providerGmail"),
        },
        {
          href: "/features/outlook-integration",
          mark: { kind: "channel", provider: "outlook" },
          title: t("NavigationBar.public.providerOutlook"),
        },
        {
          href: "/features/linkedin-integration",
          mark: { kind: "channel", provider: "linkedin" },
          title: t("NavigationBar.public.providerLinkedIn"),
        },
        {
          activeMatch: false,
          href: "/features/unified-inbox",
          mark: { kind: "channel", provider: "whatsapp" },
          title: t("NavigationBar.public.providerWhatsApp"),
        },
        {
          activeMatch: false,
          href: "/features/unified-inbox",
          mark: { kind: "channel", provider: "instagram" },
          title: t("NavigationBar.public.providerInstagram"),
        },
        {
          activeMatch: false,
          href: "/features/unified-inbox",
          mark: { kind: "channel", provider: "telegram" },
          title: t("NavigationBar.public.providerTelegram"),
        },
        {
          href: "/features/email-integration",
          mark: { kind: "channel", provider: "imap" },
          title: t("NavigationBar.public.providerImap"),
        },
        {
          href: "/features/slack-integration",
          mark: { kind: "provider", provider: "slack" },
          title: t("NavigationBar.public.providerSlack"),
        },
        {
          href: "/n8n-crm",
          mark: { kind: "automation", provider: "n8n" },
          title: t("NavigationBar.public.n8n"),
        },
      ],
      title: t("NavigationBar.public.integrations"),
    },
    {
      activeHref: "/blog",
      columns: 2,
      icon: BookOpen,
      id: "resources",
      links: [
        {
          icon: BookOpen,
          href: "/blog",
          title: t("NavigationBar.public.blog"),
        },
        {
          icon: GitCompareArrows,
          href: "/compare",
          title: t("NavigationBar.public.compare"),
        },
        {
          icon: Bot,
          href: "/blog/agentic-crm",
          title: t("NavigationBar.public.agenticCrm"),
        },
        {
          icon: Github,
          href: "/blog/open-source-crm",
          title: t("NavigationBar.public.openSourceCrm"),
        },
      ],
      title: t("NavigationBar.public.resources"),
    },
  ];
}
