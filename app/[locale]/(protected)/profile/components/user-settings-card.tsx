"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { Locale, Theme } from "@/generated/prisma";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XForm } from "@/components/x-inputs/x-form";
import { XSelect } from "@/components/x-inputs/x-select";
import { XSelectItem } from "@/components/x-inputs/x-select-item";
import { XSwitch } from "@/components/x-inputs/x-switch";
import { XCardFormFooter } from "@/components/x-card/x-card-form-footer";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XCardDefaultHeader } from "@/components/x-card/x-card-default-header";
import { usePathname } from "@/i18n/navigation";

export const UserSettingsCard = observer(() => {
  const t = useTranslations("");
  const pathname = usePathname();
  const currentLocale = useLocale();
  const { setTheme } = useTheme();

  const { userSettingsCardStore: store } = useRootStore();

  const themes = [{ key: Theme.system }, { key: Theme.dark }, { key: Theme.light }];
  const locales = [{ key: Locale.de }, { key: Locale.en }, { key: Locale.system }];

  return (
    <XForm
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
      <XCard>
        <XCardDefaultHeader title={t("UserSettingsCard.title")} />

        <XCardBody>
          <XSelect
            disallowEmptySelection
            isRequired
            description={t("UserSettingsCard.displayLanguageHint")}
            id="displayLanguage"
            items={locales}
          >
            {({ key }) =>
              XSelectItem({
                key: key,
                children: t(`Common.locales.${key}`),
              })
            }
          </XSelect>

          <XSelect
            disallowEmptySelection
            isRequired
            description={t("UserSettingsCard.formattingLocaleHint")}
            id="formattingLocale"
            items={locales}
          >
            {({ key }) =>
              XSelectItem({
                key: key,
                children: t(`Common.locales.${key}`),
              })
            }
          </XSelect>

          <XSelect disallowEmptySelection isRequired id="theme" items={themes}>
            {({ key }) =>
              XSelectItem({
                key: key,
                children: t(`Common.themes.${key}`),
              })
            }
          </XSelect>

          <p className="text-x-md">{t("UserSettingsCard.emailSubscription")}</p>

          <XSwitch id="marketingEmails" />
        </XCardBody>

        <XCardFormFooter />
      </XCard>
    </XForm>
  );
});
