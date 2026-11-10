import { Mail, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Step, Steps } from "@/components/marketing/process-steps";
import { CopyableText } from "@/components/shared/copyable-text";
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

          <CopyableText className="text-sm" value={email} />
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

        <Alert
          description={t("JoinWorkspace.safeBody")}
          icon={<ShieldCheck />}
          role="note"
          title={t("JoinWorkspace.safeTitle")}
          variant="neutral"
        />
      </AppCardBody>

      <AppCardFooter>
        <Button asChild className="w-full" variant="secondary">
          <IntlLink href="/onboarding">{t("JoinWorkspace.backAction")}</IntlLink>
        </Button>
      </AppCardFooter>
    </AppCard>
  );
}
