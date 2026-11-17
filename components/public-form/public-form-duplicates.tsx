"use client";

import type { PublicFormEditor } from "@/features/public-form/public-form.schema";

import { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { IntlLink } from "@/i18n/navigation";

type Props = { duplicates: PublicFormEditor["duplicates"]; typeId: string };

export function PublicFormDuplicates({ duplicates, typeId }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  if (duplicates.count === 0) return null;

  return (
    <section className="flex flex-col gap-3" id="public-form-duplicates">
      <h3 className="text-sm font-semibold">{t("PublicForm.builder.duplicatesTitle")}</h3>

      <p className="text-xs text-muted-foreground">
        {t("PublicForm.builder.duplicatesIntro", { count: duplicates.count })}
      </p>

      <ul className="flex flex-col gap-2">
        {duplicates.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-lg border p-3" data-form-duplicate={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {intlStore.formatDescriptiveLongDateTime(new Date(item.submittedAt))}
              </span>

              {item.recordId ? (
                <IntlLink className="text-xs text-primary underline" href={`/records/${typeId}/${item.recordId}`}>
                  {t("PublicForm.builder.duplicateOpenRecord")}
                </IntlLink>
              ) : null}
            </div>

            <dl className="flex flex-col gap-1.5">
              {item.answers.map((answer) => (
                <div key={`${answer.label}:${answer.value}`} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{answer.label}</dt>

                  <dd className="text-sm break-words whitespace-pre-line">{answer.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
