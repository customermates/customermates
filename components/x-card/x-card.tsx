import type { CardProps } from "@heroui/card";

import { Card } from "@heroui/card";
import { cn } from "@heroui/theme";

export function XCard(props: CardProps) {
  return <Card data-uid="x-card" shadow="sm" size="sm" {...props} className={cn("w-full", props.className)} />;
}
