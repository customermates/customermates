import type { ReactNode } from "react";

import { ArrowRight } from "lucide-react";

import { AppLink } from "@/components/shared/app-link";
import { externalLinkRel } from "@/components/marketing/product-demo-src";
import { cn } from "@/core/utils/cn";
import { contentLinkPrefetch } from "@/i18n/content-links";

type Props = {
  arrow?: boolean;
  children: ReactNode;
  className?: string;
  href: string;
  size?: "lg" | "md" | "sm";
  variant?: "ghost" | "primary" | "secondary";
};

function isExternal(href: string) {
  return href.startsWith("https://") || href.startsWith("http://");
}

export function marketingButtonClassName({
  className,
  size = "md",
  variant = "primary",
}: Pick<Props, "className" | "size" | "variant">) {
  return cn(
    "mk-button",
    size === "lg" && "mk-button-lg",
    size === "sm" && "mk-button-sm",
    variant === "primary" && "mk-button-primary",
    variant === "secondary" && "mk-button-secondary",
    variant === "ghost" && "mk-button-ghost",
    className,
  );
}

export function MarketingButton({ arrow = false, children, className, href, size = "md", variant = "primary" }: Props) {
  const content = (
    <>
      {children}

      {arrow ? <ArrowRight aria-hidden data-mk-arrow="" /> : null}
    </>
  );
  const classes = marketingButtonClassName({ className, size, variant });

  if (isExternal(href)) {
    return (
      <AppLink
        external
        appearance="unstyled"
        className={classes}
        href={href}
        rel={externalLinkRel(href)}
        target="_blank"
      >
        {content}
      </AppLink>
    );
  }

  return (
    <AppLink appearance="unstyled" className={classes} href={href} prefetch={contentLinkPrefetch(href)}>
      {content}
    </AppLink>
  );
}
