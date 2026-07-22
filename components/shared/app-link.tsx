"use client";

import type { ComponentProps } from "react";

import NextLink from "next/link";

import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";

type BaseProps = {
  external?: boolean;
  inheritSize?: boolean;
  className?: string;
};

type Props = BaseProps &
  (({ external: true } & ComponentProps<typeof NextLink>) | ({ external?: false } & ComponentProps<typeof IntlLink>));

export function AppLink(props: Props) {
  const { external = false, inheritSize = false, className, ...rest } = props;

  const mergedClassName = cn(
    "text-primary underline-offset-4 hover:underline transition-colors",
    inheritSize && "[font-size:inherit]",
    className,
  );

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

  return <IntlLink className={mergedClassName} {...(rest as ComponentProps<typeof IntlLink>)} />;
}
