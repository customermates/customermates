"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppLink } from "@/components/shared/app-link";
import { CardHeroHeader } from "@/components/card/card-hero-header";
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
  useNativeAnchor?: boolean;
};

export function ErrorPageView({
  title,
  subtitle,
  body,
  backHref,
  backLabel,
  error,
  retryLabel,
  onRetry,
  useNativeAnchor = false,
}: Props) {
  useEffect(() => {
    if (error) Sentry.captureException(error);
  }, [error]);

  const showRetry = onRetry !== undefined && retryLabel !== undefined;

  return (
    <CenteredCardPage>
      <AppCard className="max-w-md">
        <CardHeroHeader subtitle={subtitle} title={title} />

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
            {useNativeAnchor ? (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- callers set useNativeAnchor when next-intl provider isn't available (global-error)
              <a href={backHref}>{backLabel}</a>
            ) : (
              <AppLink href={backHref}>{backLabel}</AppLink>
            )}
          </Button>
        </AppCardFooter>
      </AppCard>
    </CenteredCardPage>
  );
}
