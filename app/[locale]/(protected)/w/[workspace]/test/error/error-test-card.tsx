"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

export function ErrorTestCard() {
  const t = useTranslations();
  const { errorTestStore } = useRootStore();

  const handleWorkflowError = async () => {
    await errorTestStore.triggerUnexpectedWorkflowError();
    toast.success(t("ErrorTestPage.workflowError.dispatched"));
  };

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader subtitle={t("ErrorTestPage.subtitle")} title={t("ErrorTestPage.title")} />

      <AppCardBody>
        <div className="space-y-6">
          <Section
            description={t("ErrorTestPage.clientSideErrors.description")}
            title={t("ErrorTestPage.clientSideErrors.title")}
          >
            <Button className="w-full" variant="destructive" onClick={errorTestStore.triggerUnexpectedClientError}>
              {t("ErrorTestPage.clientSideErrors.triggerClientError")}
            </Button>
          </Section>

          <Section
            description={t("ErrorTestPage.serverSideError.description")}
            title={t("ErrorTestPage.serverSideError.title")}
          >
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => void errorTestStore.triggerUnexpectedServerError()}
            >
              {t("ErrorTestPage.serverSideError.triggerServerError")}
            </Button>
          </Section>

          <Section
            description={t("ErrorTestPage.workflowError.description")}
            title={t("ErrorTestPage.workflowError.title")}
          >
            <Button className="w-full" variant="destructive" onClick={() => void handleWorkflowError()}>
              {t("ErrorTestPage.workflowError.triggerWorkflowError")}
            </Button>
          </Section>
        </div>
      </AppCardBody>
    </AppCard>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-x-lg mb-2">{title}</h3>

      <p className="text-x-sm text-subdued mb-4">{description}</p>

      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
