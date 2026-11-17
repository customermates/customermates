"use client";

import type { AfterSubmitChain } from "./public-form-after-submit";

import { ArrowRight, Plus, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";

import { newAutomationHref } from "./public-form-after-submit";

type Props = {
  chain: AfterSubmitChain;
  listLabel: string;
  formId: string | null;
  typeId: string;
};

export function PublicFormAfterSubmitChain({ chain, listLabel, formId, typeId }: Props) {
  const t = useTranslations();
  const recipients = chain.recipients;
  const who = recipients
    ? [
        ...recipients.owners,
        ...(recipients.assignees ? [t("PublicForm.afterSubmit.recipientAssignees")] : []),
        ...(recipients.members > 0
          ? [t("PublicForm.afterSubmit.recipientMembers", { count: recipients.members })]
          : []),
      ].join(", ")
    : "";
  const steps = [
    t("PublicForm.afterSubmit.createRecord", { list: listLabel }),
    ...(chain.personListLabel ? [t("PublicForm.afterSubmit.person", { list: chain.personListLabel })] : []),
    ...(recipients && who ? [t("PublicForm.afterSubmit.notify", { who })] : []),
  ];

  return (
    <section className="flex flex-col gap-3" id="public-form-section-after-submit">
      <h3 className="text-sm font-semibold">{t("PublicForm.afterSubmit.title")}</h3>

      <ol className="flex flex-wrap items-center gap-2" id="public-form-after-submit-chain">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            {index > 0 ? <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" /> : null}

            <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2" id="public-form-after-submit-rules">
        <p className="text-xs text-muted-foreground">
          {chain.rules.length > 0
            ? t("PublicForm.afterSubmit.rules", { count: chain.rules.length })
            : t("PublicForm.afterSubmit.noRules")}
        </p>

        {chain.rules.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {chain.rules.map((rule) => (
              <li key={rule.id} className="flex min-w-0 items-center gap-2 text-sm">
                <Zap aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />

                <IntlLink
                  className="min-w-0 truncate text-primary underline-offset-4 hover:underline"
                  data-after-submit-rule={rule.id}
                  href={rule.href}
                >
                  {rule.name}
                </IntlLink>

                {!rule.enabled ? <AppChip variant="warning">{t("PublicForm.afterSubmit.paused")}</AppChip> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <Button asChild className="self-start" id="public-form-add-automation" size="sm" variant="secondary">
          <IntlLink href={newAutomationHref({ id: formId, typeId })}>
            <Plus aria-hidden className="size-4" />

            {t("PublicForm.afterSubmit.add")}
          </IntlLink>
        </Button>
      </div>
    </section>
  );
}
