"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { useTranslations } from "next-intl";

import { triggerServerErrorAction } from "./actions";

import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";

export default function ErrorTestPage() {
  const t = useTranslations("ErrorTestPage");
  const [loading, setLoading] = useState(false);

  function triggerUnexpectedClientError() {
    throw new Error("Test client-side error - should trigger XUnexpectedErrorToaster");
  }

  async function triggerUnexpectedServerError() {
    setLoading(true);
    await triggerServerErrorAction();
    setLoading(false);
  }

  return (
    <XPageContainer>
      <XPageCenter showGridBackground>
        <XCard className="max-w-md">
          <XCardHeroHeader subtitle={t("subtitle")} title={t("title")} />

          <XCardBody>
            <div className="space-y-6">
              <div className="border-t border-default pt-6">
                <h3 className="text-x-lg mb-2">{t("clientSideErrors.title")}</h3>

                <p className="text-x-sm text-subdued mb-4">{t("clientSideErrors.description")}</p>

                <Button className="w-full" color="danger" onPress={triggerUnexpectedClientError}>
                  {t("clientSideErrors.triggerClientError")}
                </Button>
              </div>

              <div className="border-t border-default pt-6">
                <h3 className="text-x-lg mb-2">{t("serverSideError.title")}</h3>

                <p className="text-x-sm text-subdued mb-4">{t("serverSideError.description")}</p>

                <Button
                  className="w-full"
                  color="danger"
                  disabled={loading}
                  onPress={() => {
                    void triggerUnexpectedServerError();
                  }}
                >
                  {t("serverSideError.triggerServerError")}
                </Button>
              </div>
            </div>
          </XCardBody>
        </XCard>
      </XPageCenter>
    </XPageContainer>
  );
}
