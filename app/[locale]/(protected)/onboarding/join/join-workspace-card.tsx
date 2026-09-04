import { Mail, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Step, Steps } from "@/components/marketing/process-steps";
import { CopyableCode } from "@/components/shared/copyable-code";
import { IconContainer } from "@/components/shared/icon-container";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";

type Props = {
  email: string;
};

export function JoinWorkspaceCard({ email }: Props) {
  const t = useTranslations();
  const steps = [
    {
      body: t("JoinWorkspace.steps.request.body"),
      title: t("JoinWorkspace.steps.request.title"),
    },
    {
      body: t("JoinWorkspace.steps.open.body"),
      title: t("JoinWorkspace.steps.open.title"),
    },
    {
      body: t("JoinWorkspace.steps.complete.body"),
      title: t("JoinWorkspace.steps.complete.title"),
    },
  ];

  return (
    <AppCard className="max-w-lg">
      <CardHeroHeader
        alt=""
        subtitle={<span className="[overflow-wrap:anywhere]">{t("JoinWorkspace.subtitle", { email })}</span>}
        title={t("JoinWorkspace.title")}
      />

      <AppCardBody className="gap-5 pt-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Mail aria-hidden className="size-4 text-primary" />

            <h2 className="text-sm font-medium">{t("JoinWorkspace.emailLabel")}</h2>
          </div>

          <CopyableCode value={email} />
        </div>

        <section aria-labelledby="join-workspace-steps-title">
          <h2 className="sr-only" id="join-workspace-steps-title">
            {t("JoinWorkspace.stepsTitle")}
          </h2>

          <Steps className="my-0">
            {steps.map((step) => (
              <Step key={step.title} title={step.title}>
                <p>{step.body}</p>
              </Step>
            ))}
          </Steps>
        </section>

        <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
          <IconContainer className="shrink-0" icon={ShieldCheck} size="sm" />

          <div className="space-y-1">
            <h2 className="text-sm font-medium">{t("JoinWorkspace.safeTitle")}</h2>

            <p className="text-xs leading-relaxed text-muted-foreground">{t("JoinWorkspace.safeBody")}</p>
          </div>
        </div>
      </AppCardBody>

      <AppCardFooter>
        <Button asChild className="w-full" variant="secondary">
          <IntlLink href="/onboarding">{t("JoinWorkspace.backAction")}</IntlLink>
        </Button>
      </AppCardFooter>
    </AppCard>
  );
}
