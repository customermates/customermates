"use client";

import type { ReactNode } from "react";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { ErrorPageView } from "@/components/shared/error-page-view";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { publicSignupHref } from "./public-signup";

const HOME_URL = "https://customermates.com";

type Props = {
  kind: "dashboard" | "list";
  name: string;
  workspaceName: string | null;
  expiresAt: string | null;
  children: ReactNode;
  after?: ReactNode;
};

function Logo({ className }: { className: string }) {
  return (
    <>
      <Image
        alt=""
        className={cn(className, "dark:hidden")}
        height={16}
        src="/images/light/customermates-square.svg"
        width={16}
      />

      <Image
        alt=""
        className={cn(className, "hidden dark:block")}
        height={16}
        src="/images/dark/customermates-square.svg"
        width={16}
      />
    </>
  );
}

export function PublicLinkFrame({ kind, name, workspaceName, expiresAt, children, after }: Props) {
  const t = useTranslations();
  const { appMode } = useRootStore();
  const upsell = appMode === "cloud";

  return (
    <div className="min-h-full w-full bg-background" data-public-kind={kind} id="public-link">
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight" id="public-link-title">
              {name}
            </h1>

            <p className="text-sm text-muted-foreground">
              {workspaceName
                ? t("PublicLink.byline", { workspace: workspaceName })
                : kind === "list"
                  ? t("PublicLink.bylineListWithoutWorkspace")
                  : t("PublicLink.bylineWithoutWorkspace")}
            </p>
          </div>

          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" id="public-link-live">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />

            {`${t("PublicLink.readOnly")} · ${expiresAt ? t("PublicLink.expires", { date: expiresAt }) : t("PublicLink.live")}`}
          </span>
        </div>

        {children}

        {upsell ? (
          <div className="flex justify-end">
            <a
              className="group flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground"
              href={publicSignupHref("badge")}
              id="public-link-badge"
            >
              <Logo className="size-4 rounded" />

              <span>{t("PublicLink.upsell.badge")}</span>

              <span className="hidden text-primary-soft-foreground group-hover:inline group-focus-visible:inline">
                {t("PublicLink.upsell.badgeHover")}
              </span>
            </a>
          </div>
        ) : null}
      </main>

      {after}
    </div>
  );
}

export function PublicLinkUnavailable({ rateLimited }: { rateLimited: boolean }) {
  const t = useTranslations();
  return (
    <ErrorPageView
      backHref={HOME_URL}
      backLabel={t("PublicLink.toHome")}
      body={rateLimited ? t("PublicLink.rateLimitedBody") : t("PublicLink.unavailableBody")}
      subtitle={rateLimited ? t("PublicLink.rateLimitedSubtitle") : t("PublicLink.unavailableSubtitle")}
      title={rateLimited ? t("PublicLink.rateLimitedTitle") : t("PublicLink.unavailableTitle")}
    />
  );
}
