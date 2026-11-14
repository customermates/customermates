"use client";

import type {
  IncomingWebhookDto,
  IncomingWebhookPreview,
  IncomingWebhookResult,
} from "@/features/incoming-webhook/incoming-webhook.schema";
import type { IncomingWebhookDraft } from "./incoming-webhook-draft";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { PublicFormSelect } from "@/components/public-form/public-form-select";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { manageIncomingWebhookAction } from "./incoming-webhook-actions";
import { draftOf, mappingOf, parseSample, saveRequest } from "./incoming-webhook-draft";
import { IncomingWebhookMappingRows } from "./incoming-webhook-mapping-rows";
import { IncomingWebhookPreviewTable } from "./incoming-webhook-preview";

type Field = NonNullable<IncomingWebhookResult["fields"]>[number];

type Props = {
  draft: IncomingWebhookDraft | null;
  lists: ReadonlyArray<{ id: string; label: string }>;
  url: string | null;
  onChange: (draft: IncomingWebhookDraft | null) => void;
  onSaved: (webhook: IncomingWebhookDto) => void;
};

export function IncomingWebhookEditor({ draft, lists, url, onChange, onSaved }: Props) {
  const t = useTranslations();
  const [fields, setFields] = useState<Field[]>([]);
  const [preview, setPreview] = useState<IncomingWebhookPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const typeId = draft?.typeId ?? "";

  useEffect(() => {
    if (!typeId) return;
    let active = true;
    manageIncomingWebhookAction({ action: "fields", typeId })
      .then((result) => {
        if (!active) return;
        if (result.ok) setFields(result.data.fields ?? []);
        else toastZodErrorTree(result.error);
      })
      .catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [typeId]);

  if (!draft) return null;
  const patch = (next: Partial<IncomingWebhookDraft>) => onChange({ ...draft, ...next });
  const request = saveRequest(draft);
  const mapped = draft.rows
    .filter((row) => row.fieldId)
    .map((row) => ({ value: row.fieldId, label: row.path || row.fieldId }));
  const title = draft.id ? t("IncomingWebhooks.editTitle") : t("IncomingWebhooks.newTitle");

  const save = async (): Promise<IncomingWebhookDto | null> => {
    if (!request) return null;
    const result = await manageIncomingWebhookAction(request);
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return null;
    }
    const webhook = result.data.webhook ?? null;
    if (webhook) {
      onSaved(webhook);
      onChange({ ...draftOf(webhook), sample: draft.sample });
    }
    return webhook;
  };

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      if (await save()) toast.success(t("IncomingWebhooks.saved"));
    });

  const test = () =>
    run(async () => {
      const webhook = await save();
      const sample = parseSample(draft.sample);
      if (!webhook || !sample.ok || !sample.value) return;
      const result = await manageIncomingWebhookAction({
        action: "test",
        id: webhook.id,
        payload: sample.value as never,
      });
      if (result.ok) setPreview(result.data.preview ?? null);
      else toastZodErrorTree(result.error);
    });

  const rotate = () =>
    run(async () => {
      if (!draft.id) return;
      const result = await manageIncomingWebhookAction({ action: "update", id: draft.id, rotateUrl: true });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      if (result.data.webhook) onSaved(result.data.webhook);
      toast.success(t("IncomingWebhooks.rotated"));
    });

  const sampleInvalid = !parseSample(draft.sample).ok;

  return (
    <AppModal focusContentOnOpen open titleInContent size="3xl" title={title} onClose={() => onChange(null)}>
      <AppCard id="incoming-webhook-editor">
        <AppCardHeader>
          <AppModalTitle className="text-lg font-semibold">{title}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="incoming-webhook-name">{t("IncomingWebhooks.name")}</Label>

              <Input
                id="incoming-webhook-name"
                maxLength={120}
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </div>

            <PublicFormSelect
              disabled={draft.id !== null}
              id="incoming-webhook-list"
              items={lists.map((list) => ({ value: list.id, label: list.label }))}
              label={t("IncomingWebhooks.list")}
              value={draft.typeId}
              onValueChange={(value) => patch({ typeId: value, rows: [{ path: "", fieldId: "" }], matchFieldId: "" })}
            />
          </div>

          {url ? (
            <div className="flex flex-col gap-1.5">
              <Label>{t("IncomingWebhooks.url")}</Label>

              <CopyableCode anchorId="incoming-webhook-copy-url" id="incoming-webhook-url" value={url} />

              <div>
                <Button disabled={busy} size="sm" variant="secondary" onClick={() => runUserAction(rotate)}>
                  {t("IncomingWebhooks.rotate")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("IncomingWebhooks.urlAfterSave")}</p>
          )}

          <section className="flex flex-col gap-3" id="incoming-webhook-mapping">
            <h3 className="text-sm font-semibold">{t("IncomingWebhooks.mapping")}</h3>

            <IncomingWebhookMappingRows fields={fields} rows={draft.rows} onChange={(rows) => patch({ rows })} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PublicFormSelect
                id="incoming-webhook-mode"
                items={[
                  { value: "create", label: t("IncomingWebhooks.modeCreate") },
                  { value: "upsert", label: t("IncomingWebhooks.modeUpsert") },
                ]}
                label={t("IncomingWebhooks.mode")}
                value={draft.mode}
                onValueChange={(value) => patch({ mode: value === "upsert" ? "upsert" : "create" })}
              />

              {draft.mode === "upsert" && mapped.length > 0 ? (
                <PublicFormSelect
                  id="incoming-webhook-match"
                  items={mapped}
                  label={t("IncomingWebhooks.matchField")}
                  value={draft.matchFieldId || mapped[0].value}
                  onValueChange={(value) => patch({ matchFieldId: value })}
                />
              ) : null}
            </div>
          </section>

          <section className="flex flex-col gap-3" id="incoming-webhook-security">
            <h3 className="text-sm font-semibold">{t("IncomingWebhooks.security")}</h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="incoming-webhook-secret">{t("IncomingWebhooks.signingSecret")}</Label>

                <Input
                  autoComplete="off"
                  id="incoming-webhook-secret"
                  maxLength={256}
                  type="password"
                  value={draft.signingSecret}
                  onChange={(event) => patch({ signingSecret: event.target.value, clearSecret: false })}
                />

                {draft.hasSecret ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={draft.clearSecret}
                      id="incoming-webhook-clear-secret"
                      onCheckedChange={(checked) => patch({ clearSecret: checked })}
                    />

                    <Label className="font-normal" htmlFor="incoming-webhook-clear-secret">
                      {t("IncomingWebhooks.clearSecret")}
                    </Label>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="incoming-webhook-header">{t("IncomingWebhooks.signatureHeader")}</Label>

                <Input
                  id="incoming-webhook-header"
                  maxLength={64}
                  value={draft.signatureHeader}
                  onChange={(event) => patch({ signatureHeader: event.target.value })}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">{t("IncomingWebhooks.signatureHelp")}</p>
          </section>

          <section className="flex flex-col gap-3" id="incoming-webhook-sample">
            <h3 className="text-sm font-semibold">{t("IncomingWebhooks.sample")}</h3>

            <Textarea
              aria-invalid={sampleInvalid}
              className="font-mono text-xs"
              id="incoming-webhook-sample-input"
              rows={6}
              value={draft.sample}
              onChange={(event) => patch({ sample: event.target.value })}
            />

            {sampleInvalid ? <p className="text-xs text-destructive">{t("IncomingWebhooks.sampleInvalid")}</p> : null}

            <div>
              <Button
                disabled={busy || !request || sampleInvalid || draft.sample.trim().length === 0}
                id="incoming-webhook-test"
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(test)}
              >
                {t("IncomingWebhooks.test")}
              </Button>
            </div>

            {preview ? <IncomingWebhookPreviewTable preview={preview} /> : null}
          </section>

          <div className="flex items-center gap-2">
            <Switch
              checked={draft.enabled}
              id="incoming-webhook-enabled"
              onCheckedChange={(checked) => patch({ enabled: checked })}
            />

            <Label htmlFor="incoming-webhook-enabled">{t("IncomingWebhooks.enabled")}</Label>
          </div>
        </AppCardBody>

        <FormFooterActions
          editable
          anchorScope="incoming-webhook"
          creating={draft.id === null}
          dirty={request !== null && mappingOf(draft) !== null}
          saving={busy}
          onCancel={() => onChange(null)}
          onSave={submit}
        />
      </AppCard>
    </AppModal>
  );
}
