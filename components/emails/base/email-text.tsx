import type { PropsWithChildren } from "react";

import { Text } from "@react-email/components";
import { cn } from "@/core/utils/cn";

type Props = PropsWithChildren<{ className?: string }>;

export function EmailText({ className, children }: Props) {
  return <Text className={cn("text-base leading-6 text-default-900", className)}>{children}</Text>;
}
