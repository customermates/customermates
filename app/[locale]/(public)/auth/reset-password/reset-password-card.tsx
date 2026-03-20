"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { observer } from "mobx-react-lite";
import { Button } from "@heroui/button";
import { EyeSlashIcon, EyeIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";
import { XForm } from "@/components/x-inputs/x-form";
import { XInput } from "@/components/x-inputs/x-input";
import { XLink } from "@/components/x-link";
import { XIcon } from "@/components/x-icon";

export const ResetPasswordCard = observer(() => {
  const t = useTranslations("ResetPasswordCard");
  const { resetPasswordCardStore } = useRootStore();
  const { isLoading, showPassword, toggleShowPassword } = resetPasswordCardStore;
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  useEffect(() => {
    if (token && resetPasswordCardStore.form.token !== token) resetPasswordCardStore.onInitOrRefresh({ token });
  }, [token]);

  useEffect(() => {
    resetPasswordCardStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <XForm store={resetPasswordCardStore}>
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
          <XInput
            isRequired
            endContent={
              <button tabIndex={-1} type="button" onClick={toggleShowPassword}>
                <XIcon className="text-subdued" icon={showPassword ? EyeSlashIcon : EyeIcon} />
              </button>
            }
            id="password"
            type={showPassword ? "text" : "password"}
          />

          <XInput
            isRequired
            endContent={
              <button tabIndex={-1} type="button" onClick={toggleShowPassword}>
                <XIcon className="text-subdued" icon={showPassword ? EyeSlashIcon : EyeIcon} />
              </button>
            }
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
          />
        </XCardBody>

        <XCardFooter>
          <Button className="w-full" color="primary" isLoading={isLoading} type="submit">
            {t("resetPasswordCta")}
          </Button>
        </XCardFooter>
      </XCard>
    </XForm>
  );
});
