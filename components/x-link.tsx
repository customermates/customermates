"use client";

import type { LinkProps } from "@heroui/link";

import { Link } from "@heroui/link";
import { cn } from "@heroui/theme";

import { IntlLink } from "@/i18n/navigation";

type Props = LinkProps & {
  inheritSize?: boolean;
};

export function XLink({ inheritSize, ...props }: Props) {
  return (
    <Link
      as={IntlLink}
      size="sm"
      {...props}
      className={cn("z-0", props.className, inheritSize && "[font-size:inherit]")}
    />
  );
}
