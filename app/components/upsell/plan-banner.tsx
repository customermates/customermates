import type { ComponentProps } from "react";

import { Alert, type AlertVariant } from "@/components/shared/alert";

type Props = Omit<ComponentProps<typeof Alert>, "layout" | "variant"> & {
  variant?: Extract<AlertVariant, "upsell" | "warning" | "destructive" | "info" | "neutral">;
};

export function PlanBanner({ variant = "upsell", role = "status", ...props }: Props) {
  return <Alert {...props} data-plan-banner={variant} layout="banner" role={role} variant={variant} />;
}
