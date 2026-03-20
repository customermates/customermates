import type { CardFooterProps } from "@heroui/card";

import { CardFooter } from "@heroui/card";

type Props = CardFooterProps;

export function XCardFooter({ ...props }: Props) {
  return (
    <CardFooter
      {...props}
      className={`align-center flex w-full items-center justify-end gap-4 overflow-visible p-6 pt-0 ${props.className}`}
    />
  );
}
