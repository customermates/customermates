"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo } from "react";
import { useTheme } from "next-themes";
import { Locale, Theme } from "@/generated/prisma";

import { AppForm } from "@/components/forms/form-context";
import { FormSelect } from "@/components/forms/form-select";
import { FormActions } from "@/components/card/form-actions";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { usePathname } from "@/i18n/navigation";

export const UserSettingsForm = observer(() => {
  const t = useTranslations("");
  const pathname = usePathname();
  const currentLocale = useLocale();
  const { setTheme } = useTheme();
  const formId = useId();

  const { userSettingsStore: store } = useRootStore();

  const themeItems = [Theme.system, Theme.dark, Theme.light].map((key) => ({
    value: key,
    label: t(`Common.themes.${key}`),
  }));

  const localeItems = [Locale.de, Locale.en, Locale.system].map((key) => ({
    value: key,
    label: t(`Common.locales.${key}`),
  }));

  const topBarActions = useMemo(() => <FormActions formId={formId} store={store} variant="topbar" />, [formId, store]);
  useSetTopBarActions(topBarActions);

  return (
    <AppForm
      id={formId}
      store={store}
      onSubmit={(event) =>
        void store.onSubmit(event).then(() => {
          setTheme(store.form.theme);
          const locale = store.form.displayLanguage;
          const targetLocale = locale === Locale.system ? currentLocale : locale === Locale.de ? "de" : "en";
          const newPath = `/${targetLocale}${pathname}`;
          window.location.href = newPath;
        })
      }
    >
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <FormSelect required id="displayLanguage" items={localeItems} label={t("Common.inputs.displayLanguage")} />

          <p className="text-subdued text-xs">{t("UserSettingsForm.displayLanguageHint")}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <FormSelect required id="formattingLocale" items={localeItems} label={t("Common.inputs.formattingLocale")} />

          <p className="text-subdued text-xs">{t("UserSettingsForm.formattingLocaleHint")}</p>
        </div>

        <FormSelect required id="theme" items={themeItems} label={t("Common.inputs.theme")} />
      </div>
    </AppForm>
  );
});
