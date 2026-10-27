"use client";

import type { AnchorHTMLAttributes, ComponentProps } from "react";

import NextLink from "next/link";
import { useLocale } from "next-intl";

import { IntlLink, usePathname } from "@/i18n/navigation";
import {
  buildLocalePath,
  contentLocaleOrDefault,
  isMarketingPathPublished,
  isPartialMarketingLocale,
  routingLocaleFromPathname,
  stripLocalePrefix,
} from "@/i18n/locale-registry";
import { isContentPathname, isMarketingPathname, isPublicPathname } from "@/i18n/routing";
import { leavesContentTree } from "@/i18n/content-links";
import { cn } from "@/core/utils/cn";
import { externalLinkRel } from "@/components/marketing/product-demo-src";

type BaseProps = {
  appearance?: "default" | "inline" | "unstyled";
  external?: boolean;
  inheritSize?: boolean;
  className?: string;
};

type Props = BaseProps &
  (({ external: true } & ComponentProps<typeof NextLink>) | ({ external?: false } & ComponentProps<typeof IntlLink>));

export function localizedContentHref(href: string, locale: unknown): string | null {
  const base = "https://internal.invalid";
  const target = new URL(href, base);
  if (target.origin !== base || !isMarketingPathname(target.pathname)) return null;

  const targetLocale = routingLocaleFromPathname(target.pathname);
  const pathname = stripLocalePrefix(target.pathname);
  const contentLocale = isMarketingPathPublished(targetLocale, pathname)
    ? targetLocale
    : isMarketingPathPublished(locale, pathname)
      ? locale
      : contentLocaleOrDefault(locale);

  return `${buildLocalePath(contentLocale, pathname)}${target.search}${target.hash}`;
}

export function contentHrefForLocale(href: string, locale: unknown): string | null {
  const localizedHref = localizedContentHref(href, locale);
  if (!localizedHref) return null;

  const requestedLocale = routingLocaleFromPathname(new URL(href, "https://internal.invalid").pathname);
  const targetLocale = routingLocaleFromPathname(localizedHref);
  return targetLocale === locale && (requestedLocale === null || requestedLocale === targetLocale)
    ? null
    : localizedHref;
}

export function fallbackLanguageOfContentHref(href: string, locale: unknown): string | null {
  if (!isPartialMarketingLocale(locale)) return null;

  const localizedHref = localizedContentHref(href, locale);
  const targetLocale = localizedHref ? routingLocaleFromPathname(localizedHref) : null;
  return targetLocale && targetLocale !== locale ? targetLocale : null;
}

export function protectedHrefFromContent(href: string, pathname: string): string | null {
  if (!isContentPathname(pathname)) return null;

  const base = "https://internal.invalid";
  const target = new URL(href, base);
  if (target.origin !== base || isPublicPathname(target.pathname)) return null;

  const targetPathname = stripLocalePrefix(target.pathname);
  return `${targetPathname}${target.search}${target.hash}`;
}

export function AppLink(props: Props) {
  const { appearance = "default", external = false, inheritSize = false, className, ...rest } = props;
  const locale = useLocale();
  const pathname = usePathname();

  const mergedClassName =
    cn(
      appearance === "unstyled"
        ? undefined
        : appearance === "inline"
          ? "inline-link"
          : "text-primary underline-offset-4 hover:underline transition-colors",
      inheritSize && "[font-size:inherit]",
      className,
    ) || undefined;

  if (external) {
    return (
      <NextLink
        className={mergedClassName}
        rel={typeof rest.href === "string" ? externalLinkRel(rest.href) : "noopener noreferrer"}
        target="_blank"
        {...(rest as ComponentProps<typeof NextLink>)}
      />
    );
  }

  const internalProps = rest as ComponentProps<typeof IntlLink>;
  const hardNavigationHref =
    typeof internalProps.href === "string"
      ? (contentHrefForLocale(internalProps.href, locale) ?? protectedHrefFromContent(internalProps.href, pathname))
      : null;

  const fallbackLanguage =
    typeof internalProps.href === "string" ? fallbackLanguageOfContentHref(internalProps.href, locale) : null;

  if (hardNavigationHref) {
    const anchorProps = { ...internalProps } as Record<string, unknown>;
    delete anchorProps.as;
    delete anchorProps.children;
    delete anchorProps.href;
    delete anchorProps.legacyBehavior;
    delete anchorProps.locale;
    delete anchorProps.onNavigate;
    delete anchorProps.passHref;
    delete anchorProps.prefetch;
    delete anchorProps.replace;
    delete anchorProps.scroll;
    delete anchorProps.shallow;

    return (
      <a
        className={mergedClassName}
        href={hardNavigationHref}
        hrefLang={fallbackLanguage ?? undefined}
        {...(anchorProps as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {internalProps.children}

        {fallbackLanguage ? (
          <span
            className="ms-1 align-baseline text-[0.7em] font-medium uppercase text-muted-foreground"
            lang={fallbackLanguage}
          >
            {fallbackLanguage}
          </span>
        ) : null}
      </a>
    );
  }

  const prefetch =
    internalProps.prefetch === undefined && typeof internalProps.href === "string"
      ? leavesContentTree(internalProps.href, pathname)
        ? false
        : undefined
      : internalProps.prefetch;

  return <IntlLink className={mergedClassName} {...internalProps} prefetch={prefetch} />;
}
