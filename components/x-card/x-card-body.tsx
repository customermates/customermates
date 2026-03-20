import type { HTMLHeroUIProps } from "@heroui/system";

import { CardBody } from "@heroui/card";
import { cn } from "@heroui/theme";

type Props = HTMLHeroUIProps<"div">;

export function XCardBody({ ...props }: Props) {
  return <CardBody {...props} className={cn("gap-4 p-6", props.className)} />;
}
