import type { HTMLHeroUIProps } from "@heroui/system-rsc";

import { CardHeader } from "@heroui/card";

type Props = HTMLHeroUIProps<"div">;

export function XCardHeader({ ...props }: Props) {
  return (
    <CardHeader {...props} className={`z-0 align-center flex w-full items-center gap-4 p-6 pb-0 ${props.className}`} />
  );
}
