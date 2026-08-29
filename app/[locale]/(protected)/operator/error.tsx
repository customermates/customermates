"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OperatorError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();

  return (
    <Card className="m-auto w-full max-w-xl border-destructive/30">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle aria-hidden className="size-5" />
        </div>

        <CardTitle>{t("OperatorConsole.states.errorTitle")}</CardTitle>

        <CardDescription>{t("OperatorConsole.states.errorDescription")}</CardDescription>
      </CardHeader>

      <CardContent>
        <Button onClick={reset}>
          <RotateCcw aria-hidden />

          {t("OperatorConsole.actions.retry")}
        </Button>
      </CardContent>
    </Card>
  );
}
