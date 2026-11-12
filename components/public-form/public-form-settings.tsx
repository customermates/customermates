"use client";

import type { PublicFormEditor } from "@/features/public-form/public-form.schema";
import type { FormDraft } from "./public-form-draft";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { PublicFormSelect } from "./public-form-select";

const AUTO_LOCALE = "auto";

type Props = {
  draft: FormDraft;
  editor: PublicFormEditor;
  onChange: (patch: Partial<FormDraft>) => void;
};

function TextSetting({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>

      <Input id={id} maxLength={max} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function PersonSettings({ draft, editor, onChange }: Props) {
  const t = useTranslations();
  const lists = editor.peopleLists;
  const current = lists.find((list) => list.typeId === draft.personTypeId) ?? lists[0];

  const pickList = (typeId: string) => {
    const next = lists.find((list) => list.typeId === typeId);
    onChange({
      personTypeId: typeId,
      personRelationshipId: next?.relationships[0]?.id ?? "",
      personNameFieldId: next?.nameFields.find((field) => field.primary)?.fieldId ?? next?.nameFields[0]?.fieldId ?? "",
    });
  };

  if (lists.length === 0)
    return (
      <p className="text-xs text-muted-foreground" id="public-form-person-unavailable">
        {t("PublicForm.builder.personUnavailable")}
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={draft.personEnabled}
          id="public-form-person-enabled"
          onCheckedChange={(checked) => onChange({ personEnabled: checked })}
        />

        <Label htmlFor="public-form-person-enabled">{t("PublicForm.builder.personEnabled")}</Label>
      </div>

      {draft.personEnabled && current ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PublicFormSelect
            id="public-form-person-list"
            items={lists.map((list) => ({ value: list.typeId, label: list.label }))}
            label={t("PublicForm.builder.personList")}
            value={current.typeId}
            onValueChange={pickList}
          />

          <PublicFormSelect
            id="public-form-person-relationship"
            items={current.relationships.map((relation) => ({
              value: relation.id,
              label: `${relation.sourceLabel} / ${relation.targetLabel}`,
            }))}
            label={t("PublicForm.builder.personRelationship")}
            value={draft.personRelationshipId}
            onValueChange={(value) => onChange({ personRelationshipId: value })}
          />

          <TextSetting
            id="public-form-person-email-label"
            label={t("PublicForm.builder.emailLabel")}
            max={120}
            value={draft.emailLabel}
            onChange={(value) => onChange({ emailLabel: value })}
          />

          <TextSetting
            id="public-form-person-name-label"
            label={t("PublicForm.builder.nameLabel")}
            max={120}
            value={draft.nameLabel}
            onChange={(value) => onChange({ nameLabel: value })}
          />

          {current.nameFields.length > 0 ? (
            <PublicFormSelect
              id="public-form-person-name-field"
              items={current.nameFields.map((field) => ({ value: field.fieldId, label: field.label }))}
              label={t("PublicForm.builder.personNameField")}
              value={draft.personNameFieldId || current.nameFields[0].fieldId}
              onValueChange={(value) => onChange({ personNameFieldId: value })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ConsentSettings({ draft, onChange }: Pick<Props, "draft" | "onChange">) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={draft.consentEnabled}
          id="public-form-consent-enabled"
          onCheckedChange={(checked) => onChange({ consentEnabled: checked })}
        />

        <Label htmlFor="public-form-consent-enabled">{t("PublicForm.builder.consentEnabled")}</Label>
      </div>

      {draft.consentEnabled ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="public-form-consent-text">{t("PublicForm.builder.consentText")}</Label>

            <Textarea
              id="public-form-consent-text"
              maxLength={600}
              rows={2}
              value={draft.consentText}
              onChange={(event) => onChange({ consentText: event.target.value })}
            />
          </div>

          <TextSetting
            id="public-form-privacy-url"
            label={t("PublicForm.builder.privacyUrl")}
            max={2000}
            value={draft.privacyUrl}
            onChange={(value) => onChange({ privacyUrl: value })}
          />

          <p className="text-xs text-muted-foreground">{t("PublicForm.builder.consentEvidence")}</p>
        </>
      ) : null}
    </div>
  );
}

export function PublicFormSettings({ draft, editor, onChange }: Props) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3" id="public-form-section-page">
        <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionPage")}</h3>

        <TextSetting
          id="public-form-title-input"
          label={t("PublicForm.builder.pageTitle")}
          max={120}
          value={draft.title}
          onChange={(value) => onChange({ title: value })}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="public-form-description-input">{t("PublicForm.builder.pageDescription")}</Label>

          <Textarea
            id="public-form-description-input"
            maxLength={600}
            rows={2}
            value={draft.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </div>

        <TextSetting
          id="public-form-submit-label"
          label={t("PublicForm.builder.submitLabel")}
          max={60}
          value={draft.submitLabel}
          onChange={(value) => onChange({ submitLabel: value })}
        />

        <PublicFormSelect
          id="public-form-language"
          items={[
            { value: AUTO_LOCALE, label: t("PublicForm.builder.languageAuto") },
            ...APP_LOCALES.map((locale) => ({ value: locale, label: t(`Common.locales.${locale}`) })),
          ]}
          label={t("PublicForm.builder.language")}
          value={draft.locale || AUTO_LOCALE}
          onValueChange={(value) => onChange({ locale: value === AUTO_LOCALE ? "" : value })}
        />
      </section>

      <section className="flex flex-col gap-3" id="public-form-section-person">
        <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionPerson")}</h3>

        <PersonSettings draft={draft} editor={editor} onChange={onChange} />
      </section>

      <section className="flex flex-col gap-3" id="public-form-section-consent">
        <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionConsent")}</h3>

        <ConsentSettings draft={draft} onChange={onChange} />
      </section>

      <section className="flex flex-col gap-3" id="public-form-section-success">
        <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionSuccess")}</h3>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="public-form-success-message">{t("PublicForm.builder.successMessage")}</Label>

          <Textarea
            id="public-form-success-message"
            maxLength={500}
            rows={2}
            value={draft.successMessage}
            onChange={(event) => onChange({ successMessage: event.target.value })}
          />
        </div>

        <TextSetting
          id="public-form-redirect-url"
          label={t("PublicForm.builder.redirectUrl")}
          max={2000}
          value={draft.redirectUrl}
          onChange={(value) => onChange({ redirectUrl: value })}
        />
      </section>
    </div>
  );
}
