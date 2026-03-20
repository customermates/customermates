import { cn } from "@heroui/theme";

import { XInput } from "@/components/x-inputs/x-input";

type Props = {
  id: string;
  isValidFilter: boolean;
};

export function XFilterInputText({ id, isValidFilter }: Props) {
  return (
    <XInput
      classNames={{
        inputWrapper: cn("rounded-l-none", isValidFilter ? "border-primary  bg-primary-50/40" : "border-default"),
        innerWrapper: "h-full",
      }}
      id={id}
      label={null}
    />
  );
}
