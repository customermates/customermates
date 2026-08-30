import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { description?: ReactNode; icon: LucideIcon; label: string; value: ReactNode };

export function OperatorMetricCard({ description, icon: Icon, label, value }: Props) {
  return (
    <Card>
      <CardHeader className="grid grid-cols-[1fr_auto] items-start gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>

        <span className="rounded-md bg-primary/10 p-1.5 text-primary">
          <Icon aria-hidden className="size-4" />
        </span>
      </CardHeader>

      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>

        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
