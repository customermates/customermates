"use client";

import type { IncomingWebhookDto } from "@/features/incoming-webhook/incoming-webhook.schema";
import type { IncomingWebhookDraft } from "./incoming-webhook-draft";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { manageIncomingWebhookAction } from "./incoming-webhook-actions";
import { IncomingWebhookDeliveries } from "./incoming-webhook-deliveries";
import { draftOf, emptyDraft } from "./incoming-webhook-draft";
import { IncomingWebhookEditor } from "./incoming-webhook-editor";

type Props = {
  initial: IncomingWebhookDto[];
  lists: ReadonlyArray<{ id: string; label: string }>;
};

function upsert(items: IncomingWebhookDto[], webhook: IncomingWebhookDto): IncomingWebhookDto[] {
  return items.some((item) => item.id === webhook.id)
    ? items.map((item) => (item.id === webhook.id ? webhook : item))
    : [...items, webhook];
}

export function IncomingWebhooksView({ initial, lists }: Props) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState<IncomingWebhookDraft | null>(null);
  const [logFor, setLogFor] = useState<IncomingWebhookDto | null>(null);
  const listLabel = (typeId: string) => lists.find((list) => list.id === typeId)?.label ?? "";
  const editing = draft?.id ? (items.find((item) => item.id === draft.id) ?? null) : null;

  const toggle = async (webhook: IncomingWebhookDto, enabled: boolean) => {
    const result = await manageIncomingWebhookAction({ action: "update", id: webhook.id, enabled });
    if (!result.ok) return toastZodErrorTree(result.error);
    if (result.data.webhook) setItems((current) => upsert(current, result.data.webhook as IncomingWebhookDto));
  };

  const remove = async (webhook: IncomingWebhookDto): Promise<boolean> => {
    const result = await manageIncomingWebhookAction({ action: "delete", id: webhook.id });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return false;
    }
    setItems((current) => current.filter((item) => item.id !== webhook.id));
    toast.success(t("IncomingWebhooks.deleted"));
    return true;
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" id="incoming-webhooks">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("IncomingWebhooks.title")}</h2>

          <p className="text-sm text-muted-foreground">{t("IncomingWebhooks.intro")}</p>
        </div>

        <Button
          disabled={lists.length === 0}
          id="incoming-webhook-add"
          onClick={() => setDraft(emptyDraft(lists[0]?.id ?? ""))}
        >
          <Plus />

          {t("IncomingWebhooks.add")}
        </Button>
      </div>

      {items.length === 0 ? (
        <div
          className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-6"
          id="incoming-webhooks-empty"
        >
          <p className="text-sm font-medium">{t("IncomingWebhooks.emptyTitle")}</p>

          <p className="text-sm text-muted-foreground">
            {lists.length === 0 ? t("IncomingWebhooks.noLists") : t("IncomingWebhooks.emptyBody")}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((webhook) => (
            <li key={webhook.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{webhook.name}</span>

                  <span className="text-xs text-muted-foreground">
                    {[
                      listLabel(webhook.typeId),
                      webhook.lastReceivedAt
                        ? t("IncomingWebhooks.lastReceived", {
                            date: intl.formatNumericalShortDateTime(new Date(webhook.lastReceivedAt)),
                          })
                        : t("IncomingWebhooks.neverReceived"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>

                <Switch
                  aria-label={t("IncomingWebhooks.enabled")}
                  checked={webhook.enabled}
                  onCheckedChange={(checked) => runUserAction(() => toggle(webhook, checked))}
                />

                <Button size="sm" variant="secondary" onClick={() => setDraft(draftOf(webhook))}>
                  {t("IncomingWebhooks.edit")}
                </Button>

                <Button size="sm" variant="secondary" onClick={() => setLogFor(webhook)}>
                  {t("IncomingWebhooks.deliveries")}
                </Button>

                <Button
                  size="sm"
                  variant="destructiveOutline"
                  onClick={() => showDeleteConfirmation(() => remove(webhook), webhook.name)}
                >
                  {t("Common.actions.delete")}
                </Button>
              </div>

              <CopyableCode value={webhook.url} />
            </li>
          ))}
        </ul>
      )}

      <IncomingWebhookEditor
        draft={draft}
        lists={lists}
        url={editing?.url ?? null}
        onChange={setDraft}
        onSaved={(webhook) => setItems((current) => upsert(current, webhook))}
      />

      <IncomingWebhookDeliveries webhook={logFor} onClose={() => setLogFor(null)} />
    </div>
  );
}
