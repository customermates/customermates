import type { AlertProps } from "@heroui/alert";

import { Alert } from "@heroui/alert";

export function XAlert(props: AlertProps) {
  return <Alert classNames={{ iconWrapper: "my-auto" }} variant="flat" {...props} />;
}
