import type { PropsWithChildren } from "react";

import { Section, Text } from "@react-email/components";
import { cn } from "@/core/utils/cn";

type Props = PropsWithChildren<{
  label: string;
  className?: string;
}>;

export function EmailField({ label, children, className }: Props) {
  return (
    <Section className={cn("mt-4", className)}>
      <Text className="m-0 mb-1 text-xs font-medium uppercase tracking-wide text-default-700">{label}</Text>

      <Text className="m-0 text-base leading-6 text-default-900 whitespace-pre-wrap">{children}</Text>
    </Section>
  );
}
