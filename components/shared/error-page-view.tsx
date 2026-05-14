"use client";

import { useEffect } from "react";
import Image from "next/image";
import * as Sentry from "@sentry/nextjs";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  subtitle: string;
  body: string;
  backHref: string;
  backLabel: string;
  error?: Error;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorPageView({ title, subtitle, body, backHref, backLabel, error, retryLabel, onRetry }: Props) {
  useEffect(() => {
    if (error) Sentry.captureException(error);
  }, [error]);

  const showRetry = onRetry !== undefined && retryLabel !== undefined;

  return (
    <CenteredCardPage>
      <AppCard className="max-w-md">
        <AppCardHeader className="text-center flex-col gap-2">
          <Image
            alt={title}
            className="inline-block rounded-lg object-contain select-none shadow-[0_0_10px_0] shadow-primary/10 dark:hidden"
            height={48}
            src="/images/light/customermates-square.svg"
            width={48}
          />

          <Image
            alt={title}
            className="hidden rounded-lg object-contain select-none shadow-[0_0_10px_0] dark:inline-block dark:shadow-primary/20"
            height={48}
            src="/images/dark/customermates-square.svg"
            width={48}
          />

          <h1 className="text-x-2xl mt-4">{title}</h1>

          <span className="text-x-sm text-subdued">{subtitle}</span>
        </AppCardHeader>

        <AppCardBody>
          <p className="text-x-sm text-center">{body}</p>
        </AppCardBody>

        <AppCardFooter className="flex-col">
          {showRetry && (
            <Button className="w-full" variant="outline" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}

          <Button asChild className="w-full" variant="destructive">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- ErrorPageView renders without provider context (global-error) */}
            <a href={backHref}>{backLabel}</a>
          </Button>
        </AppCardFooter>
      </AppCard>
    </CenteredCardPage>
  );
}
