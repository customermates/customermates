import type { PropsWithChildren } from "react";

import { Link } from "@react-email/components";
import { cn } from "@/core/utils/cn";

type Props = PropsWithChildren<{ href: string; className?: string }>;

export function EmailLink({ href, className, children }: Props) {
  return (
    <Link className={cn("text-primary-400 break-all no-underline", className)} href={href}>
      {children}
    </Link>
  );
}
