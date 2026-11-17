"use client";

import type { PublicFormEditor } from "@/features/public-form/public-form.schema";
import type { PublicFormTabStore } from "./public-form-tab.store";

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AppCardBody } from "@/components/card/app-card-body";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useIsWiderThan } from "@/hooks/use-media-query";

import { PublicFormAfterSubmitChain } from "./public-form-after-submit-chain";
import { PublicFormFieldList } from "./public-form-field-list";
import { PublicFormPreview } from "./public-form-preview";
import { PublicFormSettings } from "./public-form-settings";

type Props = { store: PublicFormTabStore; onClose: () => void };

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

export const PublicFormTab = observer(function PublicFormTab({ store, onClose }: Props) {
  const t = useTranslations();
  const wide = useIsWiderThan("lg");
  const { editor, draft } = store;

  const texts = useMemo(
    () => ({
      submitLabel: t("PublicForm.builder.defaultSubmit"),
      successMessage: t("PublicForm.builder.defaultSuccess"),
      emailLabel: t("PublicForm.builder.defaultEmailLabel"),
      nameLabel: t("PublicForm.builder.defaultNameLabel"),
    }),
    [t],
  );

  useEffect(() => {
    store
      .load(texts)
      .then((outcome) => {
        if (outcome.status === "failed") toastZodErrorTree(outcome.error as never);
      })
      .catch(reportApplicationError);
  }, [store, texts]);

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

  const { chain } = store;

  const save = async () => {
    const outcome = await store.save();
    if (outcome.status === "failed") {
      toastZodErrorTree(outcome.error as never);
      return;
    }
    if (outcome.status === "saved") {
      toast.success(t("PublicForm.builder.saved"));
      await store.load(texts);
    }
  };

  return (
    <>
      <AppCardBody id="public-form-tab">
        <div
          className={wide ? "grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]" : "flex flex-col gap-6"}
          data-form-layout={wide ? "wide" : "compact"}
        >
          <div className="flex min-w-0 flex-col gap-5">
            <p className="text-sm text-muted-foreground">{t("PublicForm.builder.intro", { list: editor.typeLabel })}</p>

            <div className="flex items-center gap-2">
              <Switch
                checked={draft.enabled}
                id="public-form-enabled"
                onCheckedChange={(checked) => store.patch({ enabled: checked })}
              />

              <Label htmlFor="public-form-enabled">{t("PublicForm.builder.enabled")}</Label>
            </div>

            <PublicFormSettings
              draft={draft}
              editor={editor}
              onAddConsent={() => store.addConsentLine(t("PublicForm.builder.consentDefault"))}
              onChange={store.patch}
              onRemoveConsent={store.removeConsentLine}
            />

            <section className="flex flex-col gap-3" id="public-form-section-fields">
              <h3 className="text-sm font-semibold">{t("PublicForm.builder.sectionFields")}</h3>

              <PublicFormFieldList
                fields={draft.fields}
                options={editor.fields}
                onChange={(fields) => store.patch({ fields })}
                onMove={store.moveField}
              />
            </section>

            {chain ? (
              <PublicFormAfterSubmitChain
                chain={chain}
                formId={editor.form?.id ?? null}
                listLabel={editor.typeLabel}
                typeId={store.typeId}
              />
            ) : null}

            <PublishedLinks editor={editor} />

            {store.config === null ? (
              <p className="text-xs text-muted-foreground" id="public-form-invalid">
                {t("PublicForm.builder.incomplete")}
              </p>
            ) : null}
          </div>

          <div className={wide ? "min-w-0 lg:sticky lg:top-0" : "min-w-0"}>
            <PublicFormPreview store={store} />
          </div>
        </div>
      </AppCardBody>

      <FormFooterActions
        editable
        anchorScope="public-form"
        creating={!editor.form}
        dirty={store.edited && store.config !== null}
        saving={store.saving}
        onCancel={onClose}
        onSave={save}
      />
    </>
  );
});
