"use client";

import type { WikiPageStore } from "./wiki-page.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FormInput } from "@/components/forms/form-input";
import { RECORD_NAME_HEADING_CLASS } from "@/components/records/inline-edit-classes";
import { cn } from "@/core/utils/cn";

type Props = {
  store: WikiPageStore;
  large?: boolean;
};

export const WikiPageTitle = observer(function WikiPageTitle({ store, large = false }: Props) {
  const t = useTranslations();

  if (!store.canManage) {
    return (
      <h2 className={cn("min-w-0 flex-1 truncate font-semibold", large ? "text-2xl tracking-tight" : "text-lg")}>
        {store.form.title}
      </h2>
    );
  }

  return (
    <div
      aria-level={2}
      className={cn(
        RECORD_NAME_HEADING_CLASS,
        large && "[&_input]:h-11 [&_input]:text-2xl [&_input]:tracking-tight md:[&_input]:text-2xl",
      )}
      data-wiki-page-title=""
      role="heading"
    >
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
