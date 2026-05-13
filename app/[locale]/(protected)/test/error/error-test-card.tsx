"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

export function ErrorTestCard() {
  const t = useTranslations("ErrorTestPage");
  const { errorTestStore } = useRootStore();

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader subtitle={t("subtitle")} title={t("title")} />

      <AppCardBody>
        <div className="space-y-6">
          <Section description={t("clientSideErrors.description")} title={t("clientSideErrors.title")}>
            <Button className="w-full" variant="destructive" onClick={errorTestStore.triggerUnexpectedClientError}>
              {t("clientSideErrors.triggerClientError")}
            </Button>
          </Section>

          <Section description={t("serverSideError.description")} title={t("serverSideError.title")}>
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => void errorTestStore.triggerUnexpectedServerError()}
            >
              {t("serverSideError.triggerServerError")}
            </Button>
          </Section>

          <Section description={t("backgroundError.description")} title={t("backgroundError.title")}>
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => void errorTestStore.triggerBackgroundFailure()}
            >
              {t("backgroundError.triggerBackgroundError")}
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
