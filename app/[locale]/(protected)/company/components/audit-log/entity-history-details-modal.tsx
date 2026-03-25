"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { Avatar } from "@heroui/avatar";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { isEmpty, processChanges } from "./entity-history-details.utils";

import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XAvatarStack } from "@/components/x-avatar-stack";
import { XChipStack } from "@/components/x-chip/x-chip-stack";
import { XCustomFieldValue } from "@/components/x-data-view/x-custom-column/x-custom-field-value";
import { XIcon } from "@/components/x-icon";
import { serializeJSONToMarkdown } from "@/components/x-editor/x-editor.utils";
import { useRootStore } from "@/core/stores/root-store.provider";

type AvatarItem = { id: string; firstName: string; lastName: string; avatarUrl?: string | null; email?: string | null };

export const EntityHistoryDetailsModal = observer(() => {
  const t = useTranslations("");
  const { entityHistoryDetailsModalStore: store, intlStore, userModalStore, contactModalStore } = useRootStore();

  if (!store.item) return null;
  const item = store.item;

  function renderValue(key: string, value: unknown, customColumn?: CustomColumnDto): string | JSX.Element {
    if (isEmpty(value)) return t("AuditLogModal.noValue");

    switch (key) {
      case "notes":
        try {
          const markdown = typeof value === "string" ? value : serializeJSONToMarkdown(value as object);
          return (
            <div className="prose prose-xs dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          );
        } catch {
          return t("AuditLogModal.noValue");
        }
      case "users":
        return (
          <XAvatarStack items={value as AvatarItem[]} onAvatarClick={(user) => void userModalStore.loadById(user.id)} />
        );
      case "contacts":
        return (
          <XAvatarStack
            items={value as AvatarItem[]}
            onAvatarClick={(contact) => void contactModalStore.loadById(contact.id)}
          />
        );
      case "organizations":
      case "deals":
        return (
          <XChipStack
            items={(value as { id: string; name: string }[]).map((item) => ({ id: item.id, label: item.name }))}
            size="sm"
            variant="flat"
          />
        );
      case "services":
        return (
          <XChipStack
            items={(value as { id: string; name: string; quantity?: number; amount?: number }[]).map((item) => ({
              id: item.id,
              label:
                typeof item.quantity === "number" && typeof item.amount === "number"
                  ? `${item.name} – ${intlStore.formatCurrency(item.amount * item.quantity)}`
                  : item.name,
            }))}
            size="sm"
            variant="flat"
          />
        );
      case "firstName":
      case "lastName":
      case "name":
        return String(value);
      case "totalValue":
      case "amount":
        return intlStore.formatCurrency(value as number);
      case "totalQuantity":
        return intlStore.formatNumber(value as number);
      default:
        if (customColumn) {
          return (
            <XCustomFieldValue
              column={customColumn}
              item={{ id: "history", customFieldValues: [{ columnId: customColumn.id, value: value as string }] }}
            />
          );
        }
        return String(value);
    }
  }

  const customColumnsById = new Map(store.customColumns.map((customColumn) => [customColumn.id, customColumn]));
  const changes = processChanges(item, customColumnsById, t);

  function handleClose() {
    store.clear();
    store.close();
  }

  return (
    <XModal size="lg" store={store} onClose={handleClose}>
      <XCard>
        <XCardHeader>
          <h2 className="text-x-lg truncate grow">
            {t("AuditLogModal.eventAt", {
              event: t(`Common.events.${item.event}`),
              date: intlStore.formatNumericalShortDateTime(item.createdAt),
            })}
          </h2>

          <Avatar
            className="shrink-0"
            name={`${item.user.firstName} ${item.user.lastName}`.trim()}
            size="sm"
            src={item.user.avatarUrl ?? undefined}
          />
        </XCardHeader>

        <XCardBody>
          <div className="max-h-[60vh] space-y-3 overflow-auto">
            {changes.map((change, index) => (
              <div key={`${item.id}-${change.field}-${index}`} className="space-y-1">
                <span className="text-x-xs font-medium text-subdued">{change.field}</span>

                <div className="flex flex-wrap items-center gap-2 text-x-xs">
                  {!item.event.endsWith(".created") && (
                    <>
                      <div className="min-w-0 text-subdued">
                        {renderValue(change.key, change.previous, change.customColumn)}
                      </div>

                      <XIcon className="text-subdued shrink-0 self-center" icon={ArrowRightIcon} size="sm" />
                    </>
                  )}

                  <div className="min-w-0">{renderValue(change.key, change.current, change.customColumn)}</div>
                </div>
              </div>
            ))}
          </div>
        </XCardBody>
      </XCard>
    </XModal>
  );
});
