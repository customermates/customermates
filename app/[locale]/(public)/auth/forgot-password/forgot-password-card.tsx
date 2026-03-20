"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { observer } from "mobx-react-lite";
import { Button } from "@heroui/button";
import { useEffect } from "react";

import { XForm } from "@/components/x-inputs/x-form";
import { XInput } from "@/components/x-inputs/x-input";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XLink } from "@/components/x-link";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XAlert } from "@/components/x-alert";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";
import { XReveal } from "@/components/x-reveal";

export const ForgotPasswordCard = observer(() => {
  const t = useTranslations("ForgotPasswordCard");

  const searchParams = useSearchParams();
  const info = searchParams.get("info");

  const { forgotPasswordCardStore } = useRootStore();
  const { form, isLoading } = forgotPasswordCardStore;

  useEffect(() => {
    forgotPasswordCardStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <XForm store={forgotPasswordCardStore}>
      <XCard className="max-w-md">
        <XCardHeroHeader
          subtitle={t.rich("backToSignIn", {
            backToSignInLink: (chunks) => (
              <XLink inheritSize href="/auth/signin">
                {chunks}
              </XLink>
            ),
          })}
          title={t("title")}
        />

        <XCardBody>
          {info === "RESET_LINK_INVALID" && (
            <XAlert className="mb-4" color="warning">
              <p className="text-x-sm">{t("resetLinkInvalid")}</p>
            </XAlert>
          )}

          <XInput isRequired id="email" type="email" />

          <XReveal show={Boolean(form.email?.trim())}>
            <XInput isRequired id="confirmEmail" type="email" />
          </XReveal>
        </XCardBody>

        <XCardFooter>
          <Button className="w-full" color="primary" isLoading={isLoading} type="submit">
            {t("sendCta")}
          </Button>
        </XCardFooter>
      </XCard>
    </XForm>
  );
});
