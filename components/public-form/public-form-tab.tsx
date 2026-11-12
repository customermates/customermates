"use client";

import type { PublicFormEditor } from "@/features/public-form/public-form.schema";
import type { FormDraft } from "./public-form-draft";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { disablePublicFormAction, getPublicFormEditorAction, upsertPublicFormAction } from "@/app/actions";
import { PublicFormView } from "@/app/[locale]/(public)/f/[token]/public-form-view";
import { AppCardBody } from "@/components/card/app-card-body";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { initialDraft, previewForm, validDraftConfig } from "./public-form-draft";
import { PublicFormFieldList } from "./public-form-field-list";
import { PublicFormSettings } from "./public-form-settings";

type Props = { typeId: string; onClose: () => void };

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

function Notice({ id, text }: { id: string; text: string }) {
  return (
    <AppCardBody>
      <p className="text-sm text-muted-foreground" id={id}>
        {text}
      </p>
    </AppCardBody>
  );
}

export function PublicFormTab({ typeId, onClose }: Props) {
  const t = useTranslations();
  const [editor, setEditor] = useState<PublicFormEditor | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [baseline, setBaseline] = useState("");
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
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }
    const next = initialDraft(result.data, texts());
    setEditor(result.data);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  };

  useEffect(() => {
    let active = true;
    load(() => active).catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [typeId]);

  if (!editor || !draft) return <Notice id="public-form-loading" text={t("PublicForm.builder.loading")} />;

  if (!editor.allowed) {
    return (
      <Notice
        id="public-form-blocked"
        text={
          editor.reason === "workspaceDisabled"
            ? t("PublicForm.builder.workspaceDisabled")
            : t("PublicForm.builder.permissionDenied")
        }
      />
    );
  }

  if (editor.fields.length === 0) return <Notice id="public-form-no-fields" text={t("PublicForm.builder.noFields")} />;

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
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
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
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      toast.success(t("PublicForm.builder.turnedOff"));
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppCardBody id="public-form-tab">
        <p className="text-sm text-muted-foreground">{t("PublicForm.builder.intro", { list: editor.typeLabel })}</p>

        <PublicFormSettings draft={draft} editor={editor} onChange={patch} />

        <section className="flex flex-col gap-3" id="public-form-section-fields">
          <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionFields")}</h3>

          <PublicFormFieldList fields={draft.fields} options={editor.fields} onChange={(fields) => patch({ fields })} />
        </section>

        <section className="flex flex-col gap-3" id="public-form-section-preview">
          <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionPreview")}</h3>

          <div className="rounded-lg border border-border p-4" id="public-form-preview">
            <PublicFormView embedded form={previewForm(draft, editor, null)} locale={draft.locale || "en"} token="" />
          </div>
        </section>

        <PublishedLinks editor={editor} />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.enabled}
              id="public-form-enabled"
              onCheckedChange={(checked) => patch({ enabled: checked })}
            />

            <Label htmlFor="public-form-enabled">{t("PublicForm.builder.enabled")}</Label>
          </div>

          {editor.form?.enabled ? (
            <Button
              disabled={saving}
              id="public-form-turn-off"
              size="sm"
              variant="secondary"
              onClick={() => runUserAction(turnOff)}
            >
              {t("PublicForm.builder.turnOff")}
            </Button>
          ) : null}
        </div>

        {config === null ? (
          <p className="text-xs text-muted-foreground" id="public-form-invalid">
            {t("PublicForm.builder.incomplete")}
          </p>
        ) : null}
      </AppCardBody>

      <FormFooterActions
        editable
        anchorScope="public-form"
        creating={!editor.form}
        dirty={config !== null && JSON.stringify(draft) !== baseline}
        saving={saving}
        onCancel={onClose}
        onSave={save}
      />
    </>
  );
}
