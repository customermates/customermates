"use client";

import type { WikiPageKind } from "@/features/wiki/wiki.schema";
import type { WikiPageStore } from "./wiki-page.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormFieldHelp } from "@/components/forms/form-field-help";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormTextarea } from "@/components/forms/form-textarea";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import {
  WIKI_OWNER_MAX_LENGTH,
  WIKI_PAGE_KINDS,
  WIKI_WHEN_TO_USE_MAX_LENGTH,
  WikiPageKindSchema,
} from "@/features/wiki/wiki.schema";

type Props = {
  open: boolean;
  store: WikiPageStore;
  otherGuide: boolean;
  kindLabels: Record<WikiPageKind, string>;
  focusReturnTarget?: HTMLElement | null;
  onClose: () => void;
};

export const WikiPageSettings = observer(function WikiPageSettings({
  open,
  store,
  otherGuide,
  kindLabels,
  focusReturnTarget,
  onClose,
}: Props) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const canManage = store.canManage;
  const pageId = store.creating ? null : store.form.id;
  const kindHelp: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guideHelp"),
    procedure: t("Wiki.kind.procedureHelp"),
    knowledge: t("Wiki.kind.knowledgeHelp"),
  };
  const kindDescriptions: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guideDescription"),
    procedure: t("Wiki.kind.procedureDescription"),
    knowledge: t("Wiki.kind.knowledgeDescription"),
  };

  return (
    <AppModal
      focusContentOnOpen
      titleInContent
      focusReturnTarget={focusReturnTarget}
      open={open}
      size="md"
      title={t("Wiki.settings.title")}
      onClose={onClose}
    >
      <AppCard className="relative min-h-0" data-wiki-page-settings="">
        <AppCardHeader className="pb-2">
          <AppModalTitle className="text-lg font-semibold">{t("Wiki.settings.title")}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody className="gap-4 overflow-y-auto pb-6">
          <FormSelect
            disabled={!canManage}
            id="kind"
            items={WIKI_PAGE_KINDS.map((kind) => ({
              value: kind,
              label: kindLabels[kind],
              description: kind === "guide" && otherGuide ? t("Wiki.kind.guideExists") : kindDescriptions[kind],
              disabled: kind === "guide" && otherGuide,
            }))}
            label={t("Wiki.kind.label")}
            labelEndAddon={
              <FormFieldHelp label={t("Common.ariaLabels.explainField", { field: t("Wiki.kind.label") })}>
                {kindHelp[store.form.kind]}
              </FormFieldHelp>
            }
            onValueChange={(value) => {
              const kind = WikiPageKindSchema.safeParse(value);
              if (kind.success) store.onChange("kind", kind.data);
            }}
          />

          {store.form.kind === "procedure" && (
            <FormTextarea
              required
              className="min-h-0 resize-none"
              disabled={!canManage}
              id="whenToUse"
              label={t("Wiki.whenToUse.label")}
              maxLength={WIKI_WHEN_TO_USE_MAX_LENGTH}
              placeholder={t("Wiki.whenToUse.placeholder")}
              rows={2}
            />
          )}

          <FormInput
            disabled={!canManage}
            id="owner"
            label={t("Wiki.owner.label")}
            labelEndAddon={
              <FormFieldHelp label={t("Common.ariaLabels.explainField", { field: t("Wiki.owner.label") })}>
                {t("Wiki.owner.help")}
              </FormFieldHelp>
            }
            maxLength={WIKI_OWNER_MAX_LENGTH}
            placeholder={t("Wiki.owner.placeholder")}
          />

          {pageId && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 pt-1 text-sm">
              <dt className="text-muted-foreground">{t("Wiki.verified.label")}</dt>

              <dd>
                {store.form.verifiedAt
                  ? intl.formatDescriptiveShortDate(store.form.verifiedAt)
                  : t("Wiki.verified.never")}
              </dd>

              <dt className="text-muted-foreground">{t("Wiki.changed")}</dt>

              <dd>{store.form.updatedAt ? intl.formatDescriptiveShortDate(store.form.updatedAt) : ""}</dd>
            </dl>
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
