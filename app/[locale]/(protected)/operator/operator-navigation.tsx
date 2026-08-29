"use client";

import { Bot, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSelectedLayoutSegments } from "next/navigation";

import { AppLink } from "@/components/shared/app-link";
import { tabsListVariants } from "@/components/ui/tabs";
import { cn } from "@/core/utils/cn";

const LINK_CLASS_NAME =
  "relative inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 text-sm font-medium text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:bg-primary after:opacity-0 after:transition-opacity";

export function OperatorNavigation() {
  const t = useTranslations();
  const segments = useSelectedLayoutSegments();
  const hostedAiActive = segments.includes("hosted-ai");
  const usersActive = segments.includes("users");

  return (
    <nav
      aria-label={t("OperatorConsole.shell.navigationLabel")}
      className="group/tabs max-w-full shrink-0 overflow-x-auto"
      data-orientation="horizontal"
    >
      <div className={tabsListVariants({ variant: "line" })} data-variant="line">
        <AppLink
          appearance="unstyled"
          aria-current={usersActive ? "page" : undefined}
          className={cn(LINK_CLASS_NAME, usersActive && "text-primary after:opacity-100 dark:text-primary")}
          href="/operator/users"
          prefetch={false}
        >
          <UsersRound aria-hidden />

          <span>{t("OperatorConsole.shell.users")}</span>
        </AppLink>

        <AppLink
          appearance="unstyled"
          aria-current={hostedAiActive ? "page" : undefined}
          className={cn(LINK_CLASS_NAME, hostedAiActive && "text-primary after:opacity-100 dark:text-primary")}
          href="/operator/hosted-ai"
          prefetch={false}
        >
          <Bot aria-hidden />

          <span>{t("OperatorConsole.navigation")}</span>
        </AppLink>
      </div>
    </nav>
  );
}
