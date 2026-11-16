"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormTextarea } from "@/components/forms/form-textarea";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppModal } from "@/components/modal";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { IncomingWebhookPreviewTable } from "./incoming-webhook-preview";

export const IncomingWebhookModal = observer(() => {
  const t = useTranslations();
  const store = useRootStore().incomingWebhookModalStore;
  const { form, lists, fields, mapped, preview, url } = store;
  const title = form.id ? t("IncomingWebhooks.editTitle") : t("IncomingWebhooks.newTitle");

  useEffect(() => {
    if (!store.isOpen || !form.typeId) return;
    store.loadFields().catch(reportApplicationError);
  }, [store, store.isOpen, form.typeId]);

  return (
    <AppModal store={store} title={title}>
      <AppForm store={store}>
        <AppCard className="relative" id="incoming-webhook-editor">
          <AppCardHeader>
            <h2 className="truncate text-x-lg">{title}</h2>
          </AppCardHeader>

          <AppCardBody className="flex flex-col gap-5 pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInput
                required
                id="name"
                inputId="incoming-webhook-name"
                label={t("IncomingWebhooks.name")}
                maxLength={120}
              />

              <FormSelect
                disabled={Boolean(form.id)}
                id="typeId"
                inputId="incoming-webhook-list"
                items={lists.map((list) => ({ value: list.id, label: list.label }))}
                label={t("IncomingWebhooks.list")}
              />
            </div>

            {url ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">{t("IncomingWebhooks.url")}</p>

                <CopyableCode anchorId="incoming-webhook-copy-url" id="incoming-webhook-url" value={url} />

                <div>
                  <Button
                    disabled={store.isDisabled}
                    size="sm"
                    variant="secondary"
                    onClick={() => runUserAction(store.rotate)}
                  >
                    {t("IncomingWebhooks.rotate")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("IncomingWebhooks.urlAfterSave")}</p>
            )}

            <section className="flex flex-col gap-3" id="incoming-webhook-mapping">
              <h3 className="text-sm font-semibold">{t("IncomingWebhooks.mapping")}</h3>

              <div className="flex flex-col gap-2" id="incoming-webhook-rows">
                {form.rows.map((_, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                    <FormInput
                      id={`rows[${index}].path`}
                      inputId={`incoming-webhook-path-${index}`}
                      label={t("IncomingWebhooks.path")}
                      maxLength={200}
                    />

                    <FormSelect
                      id={`rows[${index}].fieldId`}
                      inputId={`incoming-webhook-field-${index}`}
                      items={fields.map((field) => ({ value: field.fieldId, label: field.label }))}
                      label={t("IncomingWebhooks.field")}
                    />

                    <IconButton
                      disabled={form.rows.length === 1 || store.isDisabled}
                      icon={X}
                      label={t("IncomingWebhooks.removeRow")}
                      onClick={() => store.removeRow(index)}
                    />
                  </div>
                ))}

                <div>
                  <Button
                    disabled={store.isDisabled}
                    id="incoming-webhook-add-row"
                    size="sm"
                    variant="secondary"
                    onClick={store.addRow}
                  >
                    <Plus />

                    {t("IncomingWebhooks.addRow")}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormSelect
                  id="mode"
                  inputId="incoming-webhook-mode"
                  items={[
                    { value: "create", label: t("IncomingWebhooks.modeCreate") },
                    { value: "upsert", label: t("IncomingWebhooks.modeUpsert") },
                  ]}
                  label={t("IncomingWebhooks.mode")}
                />

                {form.mode === "upsert" && mapped.length > 0 ? (
                  <FormSelect
                    id="matchFieldId"
                    inputId="incoming-webhook-match"
                    items={mapped}
                    label={t("IncomingWebhooks.matchField")}
                    value={form.matchFieldId || mapped[0].value}
                  />
                ) : null}
              </div>
            </section>

            <section className="flex flex-col gap-3" id="incoming-webhook-security">
              <h3 className="text-sm font-semibold">{t("IncomingWebhooks.security")}</h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <FormInput
                    autoComplete="off"
                    id="signingSecret"
                    inputId="incoming-webhook-secret"
                    label={t("IncomingWebhooks.signingSecret")}
                    maxLength={256}
                    type="password"
                  />

                  {form.hasSecret ? (
                    <FormSwitch
                      id="clearSecret"
                      inputId="incoming-webhook-clear-secret"
                      label={t("IncomingWebhooks.clearSecret")}
                    />
                  ) : null}
                </div>

                <FormInput
                  id="signatureHeader"
                  inputId="incoming-webhook-header"
                  label={t("IncomingWebhooks.signatureHeader")}
                  maxLength={64}
                />
              </div>

              <p className="text-xs text-muted-foreground">{t("IncomingWebhooks.signatureHelp")}</p>
            </section>

            <section className="flex flex-col gap-3" id="incoming-webhook-sample">
              <h3 className="text-sm font-semibold">{t("IncomingWebhooks.sample")}</h3>

              <FormTextarea
                aria-invalid={store.sampleInvalid}
                className="font-mono text-xs"
                id="sample"
                inputId="incoming-webhook-sample-input"
                rows={6}
              />

              {store.sampleInvalid ? (
                <p className="text-xs text-destructive">{t("IncomingWebhooks.sampleInvalid")}</p>
              ) : null}

              <div>
                <Button
                  disabled={!store.canTest}
                  id="incoming-webhook-test"
                  size="sm"
                  variant="secondary"
                  onClick={() => runUserAction(store.test)}
                >
                  {t("IncomingWebhooks.test")}
                </Button>
              </div>

              {preview ? <IncomingWebhookPreviewTable preview={preview} /> : null}
            </section>

            <FormSwitch id="enabled" inputId="incoming-webhook-enabled" label={t("IncomingWebhooks.enabled")} />
          </AppCardBody>

          <UnsavedChangesBar
            anchorScope="incoming-webhook"
            creating={!form.id}
            store={store}
            onSave={store.onSubmit}
          />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
