"use client";

import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ExternalLink, KeyRound, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ItemActions, ItemActionsTrigger } from "@/components/ui/item-actions";
import { Spinner } from "@/components/ui/spinner";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { resolveResourcePageState } from "@/components/page-state/resource-page-state";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

import {
  SettingsPanel,
  SettingsPanelAddButton,
  SettingsPanelAddRow,
  SettingsPanelMessage,
  SettingsPanelRow,
} from "@/components/shared/settings-panel";

const API_KEY_GRID = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_10rem_8rem_8rem_2rem]";

const MASK = "••••••••";

const ApiKeyRow = observer(({ apiKey }: { apiKey: ApiKey }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { apiKeyModalStore, apiKeysStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const name = apiKey.name?.trim() || t("ApiKeysCard.unnamed");
  const lastUsed = apiKey.lastRequest ? intlStore.formatRelativeTime(new Date(apiKey.lastRequest)) : t("Common.never");
  const expires = apiKey.expiresAt
    ? intlStore.formatDescriptiveShortDate(new Date(apiKey.expiresAt))
    : t("Common.never");

  const menu = (
    <>
      <DropdownMenuItem onSelect={() => apiKeyModalStore.view(apiKey)}>
        <ExternalLink aria-hidden />

        {t("RecordModel.openDetails")}
      </DropdownMenuItem>

      {apiKeysStore.canManage ? (
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => showDeleteConfirmation(() => apiKeysStore.delete(apiKey.id), name)}
        >
          <Trash2 aria-hidden />

          {t("Common.actions.delete")}
        </DropdownMenuItem>
      ) : null}
    </>
  );

  return (
    <ItemActions label={t("Connections.keys.actions", { name })} menu={menu}>
      <SettingsPanelRow className={cn(API_KEY_GRID, "text-sm")} data-api-key={apiKey.id}>
        <button
          className="flex min-w-0 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          type="button"
          onClick={() => apiKeyModalStore.view(apiKey)}
        >
          <KeyRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />

          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{name}</span>

            <span className="truncate text-xs text-muted-foreground">
              {t("Connections.keys.created", {
                date: intlStore.formatDescriptiveShortDate(new Date(apiKey.createdAt)),
              })}
            </span>
          </span>
        </button>

        <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block" data-api-key-prefix="">
          {apiKey.start ? `${apiKey.start}${MASK}` : MASK}
        </span>

        <span className={cn("hidden truncate sm:block", !apiKey.lastRequest && "text-muted-foreground")}>
          {lastUsed}
        </span>

        <span className="hidden truncate text-muted-foreground sm:block">{expires}</span>

        <ItemActionsTrigger />
      </SettingsPanelRow>
    </ItemActions>
  );
});

export const ApiKeysSection = observer(() => {
  const t = useTranslations();
  const { apiKeyModalStore, apiKeysStore, workspacesStore } = useRootStore();
  const { canManage } = apiKeysStore;
  const workspaceName = workspacesStore.current?.name?.trim();
  const workspaceScope = workspaceName
    ? t("Workspaces.apiKeysScopeNamed", { name: workspaceName })
    : t("Workspaces.apiKeysScope");

  const pageState = resolveResourcePageState(apiKeysStore.dataRequest, apiKeysStore.items.length);

  let body: ReactNode;
  switch (pageState) {
    case "loading":
      body = (
        <SettingsPanelMessage>
          <Spinner aria-label={t("PageState.loading")} size="sm" />
        </SettingsPanelMessage>
      );
      break;
    case "error":
      body = (
        <SettingsPanelMessage>
          <span>{t("ErrorCard.title")}</span>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => runUserAction(() => apiKeysStore.refreshQuery().catch(() => undefined))}
          >
            {t("ErrorCard.retry")}
          </Button>
        </SettingsPanelMessage>
      );
      break;
    case "true-empty":
      body = (
        <SettingsPanelMessage>
          <span data-api-keys-empty="">{t("Connections.keys.empty")}</span>
        </SettingsPanelMessage>
      );
      break;
    case "content":
      body = (
        <>
          <div
            aria-hidden
            className={cn(
              API_KEY_GRID,
              "hidden gap-3 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground sm:grid",
            )}
          >
            <span>{t("Connections.keys.columns.name")}</span>

            <span>{t("Connections.keys.columns.key")}</span>

            <span>{t("Connections.keys.columns.lastUsed")}</span>

            <span>{t("Connections.keys.columns.expires")}</span>

            <span />
          </div>

          {apiKeysStore.items.map((apiKey) => (
            <ApiKeyRow key={apiKey.id} apiKey={apiKey} />
          ))}
        </>
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <SettingsPanel
      description={`${t("Connections.keys.description")} ${workspaceScope}`}
      id="connections-keys"
      title={t("Connections.keys.title")}
    >
      {body}

      {canManage && pageState !== "loading" && pageState !== "error" ? (
        <SettingsPanelAddRow>
          <SettingsPanelAddButton
            hint={t("Connections.keys.createHint")}
            id="settings-api-keys-generate"
            label={t("Connections.keys.create")}
            onClick={() => apiKeyModalStore.add()}
          />
        </SettingsPanelAddRow>
      ) : null}
    </SettingsPanel>
  );
});
