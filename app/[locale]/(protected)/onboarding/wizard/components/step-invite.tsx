"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Link2, Loader2, Send } from "lucide-react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/core/utils/cn";
import { CopyableCode } from "@/components/shared/copyable-code";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { InviteByEmailForm } from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/company-invite/invite-by-email-form";

const InviteLink = observer(() => {
  const t = useTranslations();
  const { inviteByEmailStore } = useRootStore();
  const { inviteToken, isLoadingToken } = inviteByEmailStore;
  const inviteLink =
    inviteToken && typeof window !== "undefined" ? `${window.location.origin}/invitation/${inviteToken}` : null;

  useEffect(() => {
    void inviteByEmailStore.loadInviteToken().catch(reportApplicationError);
  }, [inviteByEmailStore]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t("OnboardingWizard.invite.linkDescription")}</p>

      {isLoadingToken ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />

          {t("OnboardingWizard.invite.loadingLink")}
        </div>
      ) : inviteLink ? (
        <CopyableCode value={inviteLink} />
      ) : (
        <p className="text-xs text-destructive">{t("OnboardingWizard.invite.linkFailed")}</p>
      )}
    </div>
  );
});

const INVITE_MODES = [
  { value: "link", Icon: Link2 },
  { value: "email", Icon: Send },
] as const;

export const StepInvite = observer(() => {
  const t = useTranslations();
  const copy = {
    link: { title: t("OnboardingWizard.invite.tabs.link"), caption: t("OnboardingWizard.invite.captions.link") },
    email: { title: t("OnboardingWizard.invite.tabs.email"), caption: t("OnboardingWizard.invite.captions.email") },
  };
  const { onboardingWizardStore: store } = useRootStore();

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label={t("CompanyInviteModal.title")}
        className="grid grid-cols-2 gap-3"
        disabled={store.isSaving}
        value={store.inviteTab}
        onValueChange={store.setInviteTab}
      >
        {INVITE_MODES.map(({ value, Icon }) => {
          const id = `onboarding-invite-${value}`;
          return (
            <div key={value} className="relative min-w-0">
              <RadioGroupItem className="peer sr-only" id={id} value={value} />

              <Label
                className={cn(
                  "interactive-surface flex h-full min-w-0 cursor-pointer flex-col items-center gap-2 rounded-xl border border-input bg-input-background px-3 py-4 text-center shadow-xs",
                  "peer-data-[state=checked]:border-primary peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-primary",
                  "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                )}
                htmlFor={id}
              >
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-xl border border-border bg-card text-foreground shadow-xs"
                >
                  <Icon className="size-5" />
                </span>

                <span className="text-sm font-semibold text-foreground">{copy[value].title}</span>

                <span className="text-xs font-normal text-muted-foreground max-sm:hidden">{copy[value].caption}</span>
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      {store.inviteTab === "link" ? <InviteLink /> : <InviteByEmailForm />}
    </div>
  );
});
