"use client";

import type { WikiPageStore } from "./wiki-page.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FormInput } from "@/components/forms/form-input";
import { RECORD_NAME_HEADING_CLASS } from "@/components/records/inline-edit-classes";

export const WikiPageTitle = observer(function WikiPageTitle({ store }: { store: WikiPageStore }) {
  const t = useTranslations();

  if (!store.canManage) return <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{store.form.title}</h2>;

  return (
    <div aria-level={2} className={RECORD_NAME_HEADING_CLASS} data-wiki-page-title="" role="heading">
      <FormInput
        required
        showErrorMessage
        aria-label={t("Wiki.pageTitle")}
        id="title"
        label={null}
        maxLength={120}
        placeholder={t("Wiki.untitled")}
      />
    </div>
  );
});
