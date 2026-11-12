"use client";

import type { PublicFormEditor } from "@/features/public-form/public-form.schema";
import type { FormDraft } from "./public-form-draft";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PublicFormView } from "@/app/[locale]/(public)/f/[token]/public-form-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CopyableCode } from "@/components/shared/copyable-code";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import {
  disablePublicFormAction,
  getPublicFormEditorAction,
  upsertPublicFormAction,
} from "./public-form-actions";
import { initialDraft, previewForm, validDraftConfig } from "./public-form-draft";
import { PublicFormFieldList } from "./public-form-field-list";
import { PublicFormSettings } from "./public-form-settings";

type Props = { typeId: string };

function UsageLine({ editor }: { editor: PublicFormEditor }) {
  const t = useTranslations();
  const usage = editor.form?.usage;
  if (!usage) return null;

  return (
    <p className="text-xs text-muted-foreground" id="public-form-usage">
      {usage.monthlyLimit === null
        ? t("PublicForm.builder.usageUnlimited", { count: usage.submissionsThisMonth })
        : t("PublicForm.builder.usageLimited", { count: usage.submissionsThisMonth, limit: usage.monthlyLimit })}

      {usage.badge ? ` ${t("PublicForm.builder.badgeNote")}` : ""}
    </p>
  );
}

function PublishedLinks({ editor }: { editor: PublicFormEditor }) {
  const t = useTranslations();
  const form = editor.form;
  if (!form) return null;

  return (
    <section className="flex flex-col gap-3" id="public-form-links">
      <div className="flex flex-col gap-1.5">
        <Label>{t("PublicForm.builder.link")}</Label>

        <CopyableCode anchorId="public-form-copy-link" id="public-form-link" value={form.url} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("PublicForm.builder.embed")}</Label>

        <CopyableCode anchorId="public-form-copy-embed" id="public-form-embed" value={form.embedSnippet} />
      </div>

      <UsageLine editor={editor} />
    </section>
  );
}

export function PublicFormTab({ typeId }: Props) {
  const t = useTranslations();
  const [editor, setEditor] = useState<PublicFormEditor | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const texts = () => ({
    submitLabel: t("PublicForm.builder.defaultSubmit"),
    successMessage: t("PublicForm.builder.defaultSuccess"),
    emailLabel: t("PublicForm.builder.defaultEmailLabel"),
    nameLabel: t("PublicForm.builder.defaultNameLabel"),
  });

  const load = async (active: () => boolean = () => true) => {
    const result = await getPublicFormEditorAction({ typeId });
    if (!active()) return;
    if (!result.ok) return toastZodErrorTree(result.error);
    setEditor(result.data);
    setDraft(initialDraft(result.data, texts()));
  };

  useEffect(() => {
    let active = true;
    load(() => active).catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [typeId]);

  if (!editor || !draft)
    return (
      <p className="text-sm text-muted-foreground" id="public-form-loading">
        {t("PublicForm.builder.loading")}
      </p>
    );

  if (!editor.allowed)
    return (
      <p className="text-sm text-muted-foreground" id="public-form-blocked">
        {editor.reason === "workspaceDisabled"
          ? t("PublicForm.builder.workspaceDisabled")
          : t("PublicForm.builder.permissionDenied")}
      </p>
    );

  if (editor.fields.length === 0)
    return (
      <p className="text-sm text-muted-foreground" id="public-form-no-fields">
        {t("PublicForm.builder.noFields")}
      </p>
    );

  const config = validDraftConfig(draft);
  const patch = (next: Partial<FormDraft>) => setDraft((current) => (current ? { ...current, ...next } : current));

  const save = async () => {
    if (!config || saving) return;
    setSaving(true);
    try {
      const result = await upsertPublicFormAction({
        ...(editor.form ? { id: editor.form.id } : { typeId, name: draft.title.trim() }),
        enabled: draft.enabled,
        config,
      });
      if (!result.ok) return toastZodErrorTree(result.error);
      toast.success(t("PublicForm.builder.saved"));
      await load();
    } finally {
      setSaving(false);
    }
  };

  const turnOff = async () => {
    if (!editor.form || saving) return;
    setSaving(true);
    try {
      const result = await disablePublicFormAction({ id: editor.form.id });
      if (!result.ok) return toastZodErrorTree(result.error);
      toast.success(t("PublicForm.builder.turnedOff"));
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5" id="public-form-tab">
      <p className="text-sm text-muted-foreground">{t("PublicForm.builder.intro", { list: editor.typeLabel })}</p>

      <PublicFormSettings draft={draft} editor={editor} onChange={patch} />

      <section className="flex flex-col gap-3" id="public-form-section-fields">
        <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionFields")}</h3>

        <PublicFormFieldList
          fields={draft.fields}
          options={editor.fields}
          onChange={(fields) => patch({ fields })}
        />
      </section>

      <section className="flex flex-col gap-3" id="public-form-section-preview">
        <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionPreview")}</h3>

        <div className="rounded-lg border border-border p-4" id="public-form-preview">
          <PublicFormView
            embedded
            preview
            form={previewForm(draft, editor, null)}
            locale={draft.locale || "en"}
            token=""
          />
        </div>
      </section>

      <PublishedLinks editor={editor} />

      <div className="flex items-center gap-2">
        <Switch
          checked={draft.enabled}
          id="public-form-enabled"
          onCheckedChange={(checked) => patch({ enabled: checked })}
        />

        <Label htmlFor="public-form-enabled">{t("PublicForm.builder.enabled")}</Label>
      </div>

      {config === null ? (
        <p className="text-xs text-muted-foreground" id="public-form-invalid">
          {t("PublicForm.builder.incomplete")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!config || saving} id="public-form-save" onClick={save}>
          {editor.form ? t("PublicForm.builder.save") : t("PublicForm.builder.create")}
        </Button>

        {editor.form?.enabled ? (
          <Button disabled={saving} id="public-form-turn-off" variant="secondary" onClick={turnOff}>
            {t("PublicForm.builder.turnOff")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
