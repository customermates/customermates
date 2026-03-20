import { cn } from "@heroui/theme";

import { XInputNumber } from "@/components/x-inputs/x-input-number";

type Props = {
  id: string;
  isValidFilter: boolean;
};

export function XFilterInputNumber({ id, isValidFilter }: Props) {
  return (
    <XInputNumber
      classNames={{
        inputWrapper: cn("rounded-l-none", isValidFilter ? "border-primary  bg-primary-50/40" : "border-default"),
        innerWrapper: "h-full",
      }}
      id={id}
      label={null}
    />
  );
}
