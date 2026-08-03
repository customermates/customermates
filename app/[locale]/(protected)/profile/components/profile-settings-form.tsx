"use client";

import type { UserDetails } from "@/features/user/get/get-user-details.interactor";
import type { AppLocale } from "@/i18n/locale-registry";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Locale, Theme } from "@/generated/prisma";

import { UserDetailsAvatar } from "./user-details-avatar";
import { VerifyEmailAction } from "./verify-email-action";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormActions } from "@/components/card/form-actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { usePathname } from "@/i18n/navigation";
import { APP_LOCALES, DEFAULT_LOCALE, appLocaleOrDefault, isAppLocale } from "@/i18n/locale-registry";

type Props = {
  userDetails: UserDetails;
  emailVerified: boolean;
};

function detectBrowserUiLocale(): AppLocale {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];

  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (isAppLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}

function resolveFormattingLanguageName(uiLocale: string): string {
  const resolvedLocale = new Intl.DateTimeFormat().resolvedOptions().locale;
  const baseLanguage = resolvedLocale.split("-")[0];

  return new Intl.DisplayNames([uiLocale], { type: "language" }).of(baseLanguage) ?? resolvedLocale;
}

export const ProfileSettingsForm = observer(({ userDetails, emailVerified }: Props) => {
  const t = useTranslations();
  const pathname = usePathname();
  const currentLocale = useLocale();
  const { setTheme, systemTheme } = useTheme();
  const formId = useId();
  const [mounted, setMounted] = useState(false);
  const { profileSettingsStore: store, userStore, navigationGuard } = useRootStore();
  const { savedState } = store;

  useEffect(() => setMounted(true), []);

  const topBarActions = useMemo(() => (emailVerified ? null : <VerifyEmailAction />), [emailVerified]);
  useSetTopBarActions(topBarActions);

  useState(() =>
    store.onInitOrRefresh({
      firstName: userDetails.firstName,
      lastName: userDetails.lastName,
      country: userDetails.country,
      avatarUrl: userDetails.avatarUrl ?? "",
      theme: userDetails.theme,
      displayLanguage: userDetails.displayLanguage,
      formattingLocale: userDetails.formattingLocale,
    }),
  );

  useEffect(() => {
    store.onInitOrRefresh({
      firstName: userDetails.firstName,
      lastName: userDetails.lastName,
      country: userDetails.country,
      avatarUrl: userDetails.avatarUrl ?? "",
      theme: userDetails.theme,
      displayLanguage: userDetails.displayLanguage,
      formattingLocale: userDetails.formattingLocale,
    });
  }, [userDetails]);

  const systemThemeLabel =
    mounted && systemTheme
      ? `${t("Common.themes.system")} (${t(`Common.themes.${systemTheme}`)})`
      : t("Common.themes.system");

  const systemDisplayLanguageLabel = mounted
    ? `${t("Common.locales.system")} (${t(`Common.locales.${detectBrowserUiLocale()}`)})`
    : t("Common.locales.system");

  const systemFormattingLocaleLabel = mounted
    ? `${t("Common.locales.system")} (${resolveFormattingLanguageName(currentLocale)})`
    : t("Common.locales.system");

  const themeItems = [Theme.system, Theme.dark, Theme.light].map((key) => ({
    value: key,
    label: key === Theme.system ? systemThemeLabel : t(`Common.themes.${key}`),
  }));

  const displayLanguageItems = [...APP_LOCALES, Locale.system].map((key) => ({
    value: key,
    label: key === Locale.system ? systemDisplayLanguageLabel : t(`Common.locales.${key}`),
  }));

  const formattingLocaleItems = [Locale.de, Locale.en, Locale.system].map((key) => ({
    value: key,
    label: key === Locale.system ? systemFormattingLocaleLabel : t(`Common.locales.${key}`),
  }));

  return (
    <AppForm
      id={formId}
      store={store}
      onSubmit={(event) => {
        const previousDisplayLanguage = store.savedState.displayLanguage;
        void store.onSubmit(event).then(() => {
          if (store.error) return;
          setTheme(store.form.theme ?? Theme.system);
          const locale = store.form.displayLanguage;
          if (locale !== previousDisplayLanguage) {
            const targetLocale = locale === Locale.system ? currentLocale : appLocaleOrDefault(locale);
            navigationGuard.tryNavigate(() => {
              window.location.href = `/${targetLocale}${pathname}`;
            });
          }
        });
      }}
    >
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <UserDetailsAvatar
          avatarUrl={savedState.avatarUrl ?? userDetails.avatarUrl ?? undefined}
          email={userStore.user?.email ?? userDetails.email}
          emailVerified={emailVerified}
          firstName={savedState.firstName || userDetails.firstName}
          lastName={savedState.lastName || userDetails.lastName}
          roleName={userStore.user?.role?.name ?? userDetails.roleName ?? ""}
          status={userStore.user?.status ?? userDetails.status}
        />

        <div className="flex flex-col gap-4">
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput required id="firstName" />

            <FormInput required id="lastName" />
          </div>

          <FormAutocompleteCountry required id="country" />

          <FormInput id="avatarUrl" />

          <FormSelect
            required
            description={t("UserSettingsForm.displayLanguageHint")}
            id="displayLanguage"
            items={displayLanguageItems}
            label={t("Common.inputs.displayLanguage")}
          />

          <FormSelect
            required
            description={t("UserSettingsForm.formattingLocaleHint")}
            id="formattingLocale"
            items={formattingLocaleItems}
            label={t("Common.inputs.formattingLocale")}
          />

          <FormSelect required id="theme" items={themeItems} label={t("Common.inputs.theme")} />
        </div>

        <FormActions anchorScope="profile-settings" formId={formId} store={store} />
      </div>
    </AppForm>
  );
});
