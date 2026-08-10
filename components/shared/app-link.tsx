"use client";

import type { AnchorHTMLAttributes, ComponentProps } from "react";

import NextLink from "next/link";
import { useLocale } from "next-intl";

import { IntlLink, usePathname } from "@/i18n/navigation";
import {
  contentLocaleOrDefault,
  isContentLocale,
  routingLocaleFromPathname,
  stripLocalePrefix,
} from "@/i18n/locale-registry";
import { isContentPathname, isPublicPathname } from "@/i18n/routing";
import { cn } from "@/core/utils/cn";

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
  if (target.origin !== base || !isContentPathname(target.pathname)) return null;

  const targetLocale = routingLocaleFromPathname(target.pathname);
  const contentLocale = isContentLocale(targetLocale) ? targetLocale : contentLocaleOrDefault(locale);
  const pathname = stripLocalePrefix(target.pathname);
  const localizedPathname = pathname === "/" ? `/${contentLocale}` : `/${contentLocale}${pathname}`;

  return `${localizedPathname}${target.search}${target.hash}`;
}

export function contentHrefForLocale(href: string, locale: unknown): string | null {
  const localizedHref = localizedContentHref(href, locale);
  if (!localizedHref) return null;
  if (!isContentLocale(locale)) return localizedHref;

  const targetLocale = routingLocaleFromPathname(new URL(href, "https://internal.invalid").pathname);
  return isContentLocale(targetLocale) && targetLocale !== locale ? localizedHref : null;
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
        rel="noopener noreferrer"
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
        {...(anchorProps as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {internalProps.children}
      </a>
    );
  }

  return <IntlLink className={mergedClassName} {...internalProps} />;
}
