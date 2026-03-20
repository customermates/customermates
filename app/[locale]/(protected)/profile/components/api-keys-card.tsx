"use client";

import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { useEffect } from "react";

import { XCard } from "@/components/x-card/x-card";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XIcon } from "@/components/x-icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useDeleteConfirmation } from "@/components/x-modal/hooks/x-use-delete-confirmation";

type Props = {
  apiKeys: ApiKey[];
};

export const ApiKeysCard = observer(({ apiKeys }: Props) => {
  const t = useTranslations("");
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const { apiKeyModalStore, apiKeysStore, intlStore } = useRootStore();

  useEffect(() => apiKeysStore.setItems({ items: apiKeys }), [apiKeys, apiKeysStore]);

  return (
    <XCard>
      <XCardHeader>
        <h2 className="text-x-lg flex-1">{t("ApiKeysCard.title")}</h2>

        <Button isIconOnly color="primary" size="sm" variant="flat" onPress={() => void apiKeyModalStore.add()}>
          <XIcon icon={PlusIcon} />
        </Button>
      </XCardHeader>

      <XCardBody>
        {apiKeysStore.items.length === 0 ? (
          <p className="text-subdued text-x-md">{t("Common.table.emptyContent")}</p>
        ) : (
          <div className="space-y-2">
            {apiKeysStore.items.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 border border-divider bg-content2 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{key.name || t("ApiKeysCard.unnamed")}</p>

                  <div className="flex flex-col gap-1 text-xs text-subdued mt-1">
                    <span>
                      {`${t("Common.table.columns.createdAt")}: ${intlStore.formatNumericalShortDateTime(key.createdAt)}`}
                    </span>

                    {key.expiresAt && (
                      <span>
                        {`${t("Common.table.columns.expiresAt")}: ${intlStore.formatNumericalShortDateTime(key.expiresAt)}`}
                      </span>
                    )}

                    {key.lastRequest && (
                      <span>
                        {`${t("Common.table.columns.lastRequest")}: ${intlStore.formatNumericalShortDateTime(key.lastRequest)}`}
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  isIconOnly
                  color="danger"
                  size="sm"
                  variant="light"
                  onPress={() => showDeleteConfirmation(() => void apiKeysStore.delete(key.id), key.name ?? undefined)}
                >
                  <XIcon icon={TrashIcon} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </XCardBody>
    </XCard>
  );
});
