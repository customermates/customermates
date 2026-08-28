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
            sizes="(min-width: 1280px) 384px, (min-width: 768px) calc(50vw - 3rem), calc(100vw - 2.5rem)"
            src={imageSrc}
            width={1920}
          />
        ) : placeholderLabel !== undefined ? (
          <div aria-hidden className="relative w-full aspect-2/1 overflow-hidden bg-sidebar">
            <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_78%_80%_at_50%_50%,black,transparent_90%)]" />

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
