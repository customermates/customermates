import type { PropsWithChildren } from "react";

import { Link } from "@react-email/components";
import { cn } from "@/core/utils/cn";

import { EMAIL_INK } from "./email-tokens";

type Props = PropsWithChildren<{ href: string; className?: string }>;

export function EmailLink({ href, className, children }: Props) {
  return (
    <Link className={cn("break-all", className)} href={href} style={{ color: EMAIL_INK, textDecoration: "underline" }}>
      {children}
    </Link>
  );
}
