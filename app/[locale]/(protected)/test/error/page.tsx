"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";

import { dispatchTriggerFailureAction, triggerServerErrorAction } from "./actions";

import { Button } from "@/components/ui/button";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { CardHeroHeader } from "@/components/card/card-hero-header";

type Outcome = { kind: "info" | "error"; text: string } | null;

export default function ErrorTestPage() {
  const t = useTranslations("ErrorTestPage");
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  function triggerUnexpectedClientError() {
    setOutcome(null);
    throw new Error("Test client-side error - should trigger UnexpectedErrorToaster + Sentry");
  }

  function triggerClientCaptureException() {
    setOutcome(null);
    Sentry.captureException(new Error("Test client captureException (no UI crash)"));
    setOutcome({ kind: "info", text: "Sent to Sentry via captureException (no UI crash)." });
  }

  async function triggerUnexpectedServerError() {
    setBusy("server");
    setOutcome(null);
    try {
      await triggerServerErrorAction();
    } catch (err) {
      setOutcome({
        kind: "info",
        text: `Server action threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function triggerBackgroundFailure() {
    setBusy("trigger");
    setOutcome(null);
    try {
      const { runId } = await dispatchTriggerFailureAction();
      setOutcome({ kind: "info", text: `Queued trigger.dev failure task. Run id: ${runId}` });
    } catch (err) {
      setOutcome({
        kind: "error",
        text: `Failed to dispatch trigger task: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <CenteredCardPage>
      <AppCard className="max-w-md">
        <CardHeroHeader subtitle={t("subtitle")} title={t("title")} />

        <AppCardBody>
          <div className="space-y-6">
            <Section description={t("clientSideErrors.description")} title={t("clientSideErrors.title")}>
              <Button
                className="w-full"
                disabled={busy !== null}
                variant="destructive"
                onClick={triggerUnexpectedClientError}
              >
                {t("clientSideErrors.triggerClientError")}
              </Button>

              <Button
                className="w-full"
                disabled={busy !== null}
                variant="outline"
                onClick={triggerClientCaptureException}
              >
                {t("clientSideErrors.triggerCaptureException")}
              </Button>
            </Section>

            <Section description={t("serverSideError.description")} title={t("serverSideError.title")}>
              <Button
                className="w-full"
                disabled={busy !== null}
                variant="destructive"
                onClick={() => void triggerUnexpectedServerError()}
              >
                {busy === "server" ? t("serverSideError.triggering") : t("serverSideError.triggerServerError")}
              </Button>
            </Section>

            <Section description={t("backgroundError.description")} title={t("backgroundError.title")}>
              <Button
                className="w-full"
                disabled={busy !== null}
                variant="destructive"
                onClick={() => void triggerBackgroundFailure()}
              >
                {busy === "trigger" ? t("backgroundError.triggering") : t("backgroundError.triggerBackgroundError")}
              </Button>
            </Section>

            {outcome && (
              <p className={`text-x-sm ${outcome.kind === "error" ? "text-destructive" : "text-subdued"}`}>
                {outcome.text}
              </p>
            )}
          </div>
        </AppCardBody>
      </AppCard>
    </CenteredCardPage>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-6">
      <h3 className="text-x-lg mb-2">{title}</h3>

      <p className="text-x-sm text-subdued mb-4">{description}</p>

      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
