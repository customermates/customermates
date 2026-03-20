import type { PropsWithChildren } from "react";

import { Section } from "@react-email/components";
import { cn } from "@heroui/theme";

type Props = PropsWithChildren<{ className?: string }>;

export function XEmailSection({ className, children }: Props) {
  return <Section className={cn("my-6", className)}>{children}</Section>;
}
