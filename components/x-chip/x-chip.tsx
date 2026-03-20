import type { ChipProps } from "@heroui/chip";

import { Chip } from "@heroui/chip";
import { cn } from "@heroui/theme";

type Props = {
  children: React.ReactNode;
} & ChipProps;

export function XChip({ children, ...props }: Props) {
  return (
    <Chip
      radius="full"
      size="sm"
      variant="flat"
      {...props}
      classNames={{
        base: cn("truncate max-w-full min-w-0 w-auto", props.classNames?.base),
        content: cn("truncate", props.classNames?.content),
      }}
    >
      <span className="truncate">{children}</span>
    </Chip>
  );
}
