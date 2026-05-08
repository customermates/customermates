"use client";

import type { ReactNode } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppImage } from "@/components/shared/app-image";
import { AppLink } from "@/components/shared/app-link";

export type PostCardProps = {
  bottom?: ReactNode;
  description?: string;
  href: string;
  imageAlt?: string;
  imageIsLocalized?: boolean;
  imageSrc?: string;
  placeholderLabel?: string;
  title: string;
  topLeft?: ReactNode;
  topRight?: ReactNode;
};

export function PostCard({
  bottom,
  description,
  href,
  imageAlt,
  imageIsLocalized = true,
  imageSrc,
  placeholderLabel,
  title,
  topLeft,
  topRight,
}: PostCardProps) {
  const showMeta = Boolean(topLeft) || Boolean(topRight);

  return (
    <AppLink className="interactive-surface block min-w-0 size-full text-foreground" href={href}>
      <AppCard className="flex size-full min-w-0 flex-col overflow-hidden">
        {imageSrc ? (
          <AppImage
            alt={imageAlt ?? title}
            className="w-full aspect-2/1 object-cover object-top-left rounded-none"
            height={1080}
            isLocalized={imageIsLocalized}
            src={imageSrc}
            width={1920}
          />
        ) : placeholderLabel !== undefined ? (
          <div
            aria-hidden
            className="relative w-full aspect-2/1 overflow-hidden bg-linear-to-br from-primary/25 via-primary/10 to-card"
          >
            <div className="pointer-events-none absolute -right-12 -top-12 size-56 rounded-full bg-primary/30 blur-3xl" />

            <div className="pointer-events-none absolute -bottom-12 -left-12 size-48 rounded-full bg-primary/20 blur-3xl" />

            <div className="relative flex size-full items-center justify-center px-6">
              <span className="text-x-xl line-clamp-3 text-center font-semibold text-foreground">
                {placeholderLabel}
              </span>
            </div>
          </div>
        ) : null}

        <AppCardBody>
          {showMeta ? (
            <div className="flex min-w-0 items-center justify-between gap-2 text-sm text-subdued">
              {topLeft ?? <span />}

              {topRight ?? null}
            </div>
          ) : null}

          <h3 className="text-base font-semibold leading-snug">{title}</h3>

          {description ? <p className="text-sm text-subdued line-clamp-2">{description}</p> : null}

          {bottom}
        </AppCardBody>
      </AppCard>
    </AppLink>
  );
}
