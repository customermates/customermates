import type { BadgeProps } from "@heroui/badge";

import { cn } from "@heroui/theme";
import { Badge } from "@heroui/badge";

type Props = BadgeProps & {
  borderColor?: "none" | "content1" | "content2";
};

export function XBadge({ borderColor, ...props }: Props) {
  return (
    <Badge
      color="primary"
      variant="flat"
      {...props}
      classNames={{
        badge: cn(
          "backdrop-blur-sm",
          {
            "text-[0.8rem]!": props.size === "md" || props.size === undefined,
            "border-none!": borderColor === "none",
            "border-solid border-content1!": borderColor === "content1",
            "border-solid border-content2!": borderColor === "content2",
          },
          props.classNames?.badge,
        ),
      }}
    />
  );
}
