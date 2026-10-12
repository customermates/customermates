import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import { ConnectedAccountEmailSchema } from "@/ee/messaging/email-settings";
import { ConnectedAccountAppDtoSchema } from "@/ee/messaging/messaging.schema";
import { SetSelectedFoldersSchema } from "@/ee/messaging/connect/set-selected-folders.interactor";
import { SetConnectedAccountVisibilitySchema } from "@/ee/messaging/connect/set-connected-account-visibility.interactor";

const AccountPath = { path: z.object({ id: z.uuid() }) };
const OWNER_ONLY = "Only the account owner can change it; another member's account answers 404.";

function accountSettingOperation(
  operationId: string,
  summary: string,
  description: string,
  schema: z.ZodType,
): ZodOpenApiOperationObject {
  return {
    operationId,
    summary,
    description: `${description} ${OWNER_ONLY} Returns the saved account. Requires: Inbox messages Edit.`,
    tags: ["messaging"],
    security: [{ apiKeyAuth: [] }],
    requestParams: AccountPath,
    requestBody: { required: true, content: { "application/json": { schema } } },
    responses: {
      "200": {
        description: "The saved connected account.",
        content: { "application/json": { schema: ConnectedAccountAppDtoSchema } },
      },
      ...StructuredApiResponses,
    },
  };
}

export const connectedAccountSettingsApiPaths = {
  "/v1/messaging/connected-accounts/{id}": {
    delete: {
      operationId: "disconnectConnectedAccount",
      summary: "Disconnect a connected account",
      description: `Disconnects one of your connected accounts: it is removed from the workspace and from the messaging provider, and its synced conversations disappear. This cannot be undone; connecting the account again starts a new sync. ${OWNER_ONLY} Requires: Inbox messages Delete.`,
      tags: ["messaging"],
      security: [{ apiKeyAuth: [] }],
      requestParams: AccountPath,
      responses: {
        "200": {
          description: "The account was disconnected.",
          content: {
            "application/json": { schema: z.object({ id: z.uuid(), disconnected: z.literal(true) }) },
          },
        },
        ...StructuredApiResponses,
      },
    },
  },
  "/v1/messaging/connected-accounts/{id}/folders": {
    post: accountSettingOperation(
      "setConnectedAccountFolders",
      "Choose the synced email folders",
      "Replaces the set of email folders that sync, as the account's Folders tab does. Pass folder ids from GET /v1/messaging/connected-accounts; unknown ids are ignored, and newly enabled folders sync in the background.",
      SetSelectedFoldersSchema.omit({ id: true }),
    ),
  },
  "/v1/messaging/connected-accounts/{id}/signature": {
    post: accountSettingOperation(
      "setConnectedAccountSignature",
      "Set the email signature and appearance",
      "Saves the signature text (Markdown, up to 2,000 characters, empty to clear) and the complete email settings (appearance and signature layout), as the account's Email tab does.",
      ConnectedAccountEmailSchema,
    ),
  },
  "/v1/messaging/connected-accounts/{id}/sharing": {
    post: accountSettingOperation(
      "setConnectedAccountSharing",
      "Share or unshare a connected account",
      "shared true shows every conversation of the account to all members who can read the Inbox; false makes it private again. Needs a plan with shared accounts (Business or Enterprise).",
      SetConnectedAccountVisibilitySchema.omit({ id: true }),
    ),
  },
  "/v1/messaging/connected-accounts/{id}/resync": {
    post: {
      operationId: "resyncConnectedAccount",
      summary: "Resync a connected account",
      description: `Fetches the account's history again in the background. Send an empty JSON object. ${OWNER_ONLY} Requires: Inbox messages Edit.`,
      tags: ["messaging"],
      security: [{ apiKeyAuth: [] }],
      requestParams: AccountPath,
      requestBody: {
        required: true,
        content: { "application/json": { schema: z.object({}).strict(), examples: { default: { value: {} } } } },
      },
      responses: {
        "200": {
          description: "The resync started.",
          content: {
            "application/json": { schema: z.object({ id: z.uuid(), resyncStarted: z.literal(true) }) },
          },
        },
        ...StructuredApiResponses,
      },
    },
  },
} satisfies Record<string, Record<string, ZodOpenApiOperationObject>>;
