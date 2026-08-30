import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { IconContainer } from "@/components/shared/icon-container";

type Props = { description?: ReactNode; icon: LucideIcon; label: string; value: ReactNode };

export function OperatorMetricCard({ description, icon, label, value }: Props) {
  return (
    <AppCard>
      <AppCardHeader className="gap-3">
        <IconContainer className="shrink-0" icon={icon} size="sm" />

        <h2 className="text-x-sm grow truncate text-muted-foreground">{label}</h2>
      </AppCardHeader>

      <AppCardBody className="gap-1">
        <p className="text-x-2xl font-semibold tabular-nums">{value}</p>

        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </AppCardBody>
    </AppCard>
  );
}
