import { createDocument } from "zod-openapi";

import {
  CalculationExpressionShapeSchema,
  RecordAddressPartsInputSchema,
  RecordAddressSchema,
} from "@/features/records/record-model.schema";
import { CalculationExpressionInputSchema } from "@/features/records/configuration.schema";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { getCalendarByIdOperation } from "@/ee/calendar/get-calendar-by-id.openapi";
import { getCalendarEventByIdOperation } from "@/ee/calendar/get-calendar-event-by-id.openapi";
import { getCalendarEventsOperation } from "@/ee/calendar/get-calendar-events.openapi";
import { getCalendarsOperation } from "@/ee/calendar/get-calendars.openapi";
import { getConnectedAccountsOperation } from "@/ee/messaging/connect/get-my-connected-accounts.openapi";
import { connectedAccountSettingsApiPaths } from "@/ee/messaging/connect/connected-account-settings.openapi";
import { createConnectLinkOperation } from "@/ee/messaging/connect/create-auth-link.openapi";
import { GetMessagingThreadResultSchema } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import { getMessagingThreadOperation } from "@/ee/messaging/inbox/get-messaging-thread.openapi";
import { getMessagingThreadsOperation } from "@/ee/messaging/inbox/get-messaging-threads.openapi";
import { moveEmailThreadOperation } from "@/ee/messaging/inbox/move-email-thread.openapi";
import { updateMessagingThreadStateOperation } from "@/ee/messaging/thread-state/update-thread.openapi";
import { ConnectedAccountDtoSchema, MessagingThreadSchema } from "@/ee/messaging/messaging.schema";
import { discardDraftOperation } from "@/ee/messaging/outbound/discard-draft.openapi";
import { saveDraftOperation, saveNewThreadDraftOperation } from "@/ee/messaging/outbound/save-draft.openapi";
import { SendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { sendChatMessageOperation } from "@/ee/messaging/outbound/send-chat-message.openapi";
import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { sendEmailOperation } from "@/ee/messaging/outbound/send-email.openapi";
import { StartChatInputSchema } from "@/ee/messaging/outbound/start-chat.interactor";
import { startChatOperation } from "@/ee/messaging/outbound/start-chat.openapi";
import { acceptRelationRequestOperation } from "@/ee/messaging/posts/accept-relation-request.openapi";
import { cancelRelationRequestOperation } from "@/ee/messaging/posts/cancel-relation-request.openapi";
import { createRelationRequestOperation } from "@/ee/messaging/posts/create-relation-request.openapi";
import { getSocialProfileOperation } from "@/ee/messaging/posts/get-social-profile.openapi";
import { listRelationRequestsOperation } from "@/ee/messaging/posts/list-relation-requests.openapi";
import { getSocialPostEngagementOperation } from "@/ee/messaging/posts/list-social-post-comments.openapi";
import { getSocialPostsOperation } from "@/ee/messaging/posts/list-social-posts.openapi";
import { linkedinBrowseSalesListOperation } from "@/ee/messaging/sales-navigator/linkedin-browse-sales-list.openapi";
import { linkedinListSalesListsOperation } from "@/ee/messaging/sales-navigator/linkedin-list-sales-lists.openapi";
import { linkedinListSalesSearchParametersOperation } from "@/ee/messaging/sales-navigator/linkedin-list-sales-search-parameters.openapi";
import { linkedinSaveToSalesListOperation } from "@/ee/messaging/sales-navigator/linkedin-save-to-sales-list.openapi";
import { linkedinSearchSalesCompaniesOperation } from "@/ee/messaging/sales-navigator/linkedin-search-sales-companies.openapi";
import { linkedinSearchSalesNavigatorOperation } from "@/ee/messaging/sales-navigator/linkedin-search-sales-navigator.openapi";
import { linkedinSearchSalesPeopleOperation } from "@/ee/messaging/sales-navigator/linkedin-search-sales-people.openapi";
import {
  webhookMessagingCalendarChangedOperation,
  WebhookMessagingCalendarChangedSchema,
} from "@/ee/messaging/webhooks/calendar/calendar-changed.openapi";
import {
  webhookMessagingCalendarEventChangedOperation,
  WebhookMessagingCalendarEventChangedSchema,
} from "@/ee/messaging/webhooks/calendar/calendar-event-changed.openapi";
import {
  webhookMessagingChatDeletedOperation,
  WebhookMessagingChatDeletedSchema,
} from "@/ee/messaging/webhooks/chat/chat-deleted.openapi";
import {
  webhookMessagingChatUpdatedOperation,
  WebhookMessagingChatUpdatedSchema,
} from "@/ee/messaging/webhooks/chat/chat-updated.openapi";
import {
  webhookMessagingEmailDeletedOperation,
  WebhookMessagingEmailDeletedSchema,
} from "@/ee/messaging/webhooks/email/email-deleted.openapi";
import {
  webhookMessagingEmailReceivedOperation,
  WebhookMessagingEmailReceivedSchema,
} from "@/ee/messaging/webhooks/email/email-received.openapi";
import {
  webhookMessagingMessageDeletedOperation,
  WebhookMessagingMessageDeletedSchema,
} from "@/ee/messaging/webhooks/message/message-deleted.openapi";
import {
  webhookMessagingMessageReactionOperation,
  WebhookMessagingMessageReactionSchema,
} from "@/ee/messaging/webhooks/message/message-reaction.openapi";
import {
  webhookMessagingMessageReceivedOperation,
  WebhookMessagingMessageReceivedSchema,
} from "@/ee/messaging/webhooks/message/message-received.openapi";
import {
  webhookMessagingMessageUpdatedOperation,
  WebhookMessagingMessageUpdatedSchema,
} from "@/ee/messaging/webhooks/message/message-updated.openapi";
import {
  webhookMessagingRelationCreatedOperation,
  WebhookMessagingRelationCreatedSchema,
} from "@/ee/messaging/webhooks/relation/relation-created.openapi";
import { recordWebhookOperations } from "@/features/records/record-webhooks.openapi";
import { recordApiPaths } from "@/features/records/records.openapi";
import { getUserDetailsOperation } from "@/features/user/get/get-user-details.openapi";
import { getUsersOperation } from "@/features/user/get/get-users.openapi";
import { memberApiPaths, updateUserProfileOperation } from "@/features/user/upsert/team.openapi";
import { UserDtoSchema } from "@/features/user/user.schema";
import { wikiApiPaths } from "@/features/wiki/wiki.openapi";
import { createWebhookOperation } from "@/features/webhook/create-webhook.openapi";
import { deleteWebhookOperation } from "@/features/webhook/delete-webhook.openapi";
import { getWebhookOperation } from "@/features/webhook/get-webhook.openapi";
import {
  listWebhookDeliveriesOperation,
  listWebhooksOperation,
  listWorkspaceWebhookDeliveriesOperation,
  resendWebhookDeliveryOperation,
  updateWebhookOperation,
} from "@/features/webhook/webhook-rest.openapi";
import { routineApiPaths } from "@/ee/routines/routines.openapi";
import { RoutineDtoSchema } from "@/ee/routines/routine.schema";
import { WebhookPublicDtoSchema } from "@/features/webhook/webhook.schema";

import { recordModelApiPaths } from "@/features/records/record-model.openapi";
import { dataViewApiPaths } from "@/features/data-view/data-view.openapi";
import { widgetApiPaths } from "@/features/widget/widget.openapi";
import { trashApiPaths } from "@/features/trash/trash.openapi";
import { addressApiPaths } from "@/features/addresses/addresses.openapi";

export function generateOpenApiSpec() {
  const document = createDocument({
    openapi: "3.1.0",
    info: {
      title: "Customermates API",
      description: "API for Customermates application",
      version: "1.0.0",
    },
    servers: [
      {
        url: "/api",
        description: "API Server",
      },
    ],
    paths: {
      ...recordApiPaths,
      ...wikiApiPaths,
      ...memberApiPaths,
      ...recordModelApiPaths,
      ...dataViewApiPaths,
      ...widgetApiPaths,
      ...trashApiPaths,
      ...addressApiPaths,
      ...connectedAccountSettingsApiPaths,
      "/v1/users/search": {
        post: getUsersOperation,
      },
      "/v1/users/me": {
        get: getUserDetailsOperation,
        patch: updateUserProfileOperation,
      },
      ...routineApiPaths,
      "/v1/webhooks": {
        get: listWebhooksOperation,
        post: createWebhookOperation,
      },
      "/v1/webhooks/deliveries": {
        get: listWorkspaceWebhookDeliveriesOperation,
      },
      "/v1/webhooks/{id}": {
        get: getWebhookOperation,
        patch: updateWebhookOperation,
        delete: deleteWebhookOperation,
      },
      "/v1/webhooks/{id}/deliveries": {
        get: listWebhookDeliveriesOperation,
      },
      "/v1/webhooks/{id}/deliveries/{deliveryId}/resend": {
        post: resendWebhookDeliveryOperation,
      },
      "/v1/messaging/connected-accounts": {
        get: getConnectedAccountsOperation,
      },
      "/v1/messaging/connected-accounts/connect-link": {
        post: createConnectLinkOperation,
      },
      "/v1/messaging/threads/search": {
        post: getMessagingThreadsOperation,
      },
      "/v1/messaging/threads/{id}": {
        get: getMessagingThreadOperation,
      },
      "/v1/messaging/threads/{id}/messages": {
        post: sendChatMessageOperation,
      },
      "/v1/messaging/threads/{id}/state": {
        post: updateMessagingThreadStateOperation,
      },
      "/v1/messaging/threads/{id}/move": {
        post: moveEmailThreadOperation,
      },
      "/v1/messaging/calendars/search": {
        post: getCalendarsOperation,
      },
      "/v1/messaging/calendars/{id}": {
        get: getCalendarByIdOperation,
      },
      "/v1/messaging/calendar-events/search": {
        post: getCalendarEventsOperation,
      },
      "/v1/messaging/calendar-events/{id}": {
        get: getCalendarEventByIdOperation,
      },
      "/v1/messaging/send-email": {
        post: sendEmailOperation,
      },
      "/v1/messaging/start-chat": {
        post: startChatOperation,
      },
      "/v1/messaging/threads/{id}/drafts": {
        post: saveDraftOperation,
      },
      "/v1/messaging/drafts": {
        post: saveNewThreadDraftOperation,
      },
      "/v1/messaging/drafts/{id}": {
        delete: discardDraftOperation,
      },
      "/v1/messaging/social-posts/search": {
        post: getSocialPostsOperation,
      },
      "/v1/messaging/social-post-engagement/search": {
        post: getSocialPostEngagementOperation,
      },
      "/v1/messaging/social-profiles/search": {
        post: getSocialProfileOperation,
      },
      "/v1/messaging/sales-navigator/search": {
        post: linkedinSearchSalesNavigatorOperation,
      },
      "/v1/messaging/sales-navigator/search/people": {
        post: linkedinSearchSalesPeopleOperation,
      },
      "/v1/messaging/sales-navigator/search/companies": {
        post: linkedinSearchSalesCompaniesOperation,
      },
      "/v1/messaging/sales-navigator/search/parameters": {
        post: linkedinListSalesSearchParametersOperation,
      },
      "/v1/messaging/sales-navigator/lists/search": {
        post: linkedinListSalesListsOperation,
      },
      "/v1/messaging/sales-navigator/lists/browse": {
        post: linkedinBrowseSalesListOperation,
      },
      "/v1/messaging/sales-navigator/lists/save": {
        post: linkedinSaveToSalesListOperation,
      },
      "/v1/messaging/social-relations/search": {
        post: listRelationRequestsOperation,
      },
      "/v1/messaging/social-relations/invite": {
        post: createRelationRequestOperation,
      },
      "/v1/messaging/social-relations/accept": {
        post: acceptRelationRequestOperation,
      },
      "/v1/messaging/social-relations/cancel": {
        post: cancelRelationRequestOperation,
      },
    },
    webhooks: {
      ...recordWebhookOperations,
      messagingMessageReceived: {
        post: webhookMessagingMessageReceivedOperation,
      },
      messagingMessageUpdated: {
        post: webhookMessagingMessageUpdatedOperation,
      },
      messagingMessageDeleted: {
        post: webhookMessagingMessageDeletedOperation,
      },
      messagingMessageReaction: {
        post: webhookMessagingMessageReactionOperation,
      },
      messagingEmailReceived: {
        post: webhookMessagingEmailReceivedOperation,
      },
      messagingEmailDeleted: {
        post: webhookMessagingEmailDeletedOperation,
      },
      messagingChatUpdated: {
        post: webhookMessagingChatUpdatedOperation,
      },
      messagingChatDeleted: {
        post: webhookMessagingChatDeletedOperation,
      },
      messagingCalendarChanged: {
        post: webhookMessagingCalendarChangedOperation,
      },
      messagingCalendarEventChanged: {
        post: webhookMessagingCalendarEventChangedOperation,
      },
      messagingRelationCreated: {
        post: webhookMessagingRelationCreatedOperation,
      },
    },
    components: {
      schemas: {
        CalculationExpression: CalculationExpressionShapeSchema,
        CalculationExpressionInput: CalculationExpressionInputSchema,
        RecordAddress: RecordAddressSchema,
        RecordAddressPartsInput: RecordAddressPartsInputSchema,
        StructuredErrorResponseSchema,
        WebhookMessagingMessageReceivedSchema,
        WebhookMessagingMessageUpdatedSchema,
        WebhookMessagingMessageDeletedSchema,
        WebhookMessagingMessageReactionSchema,
        WebhookMessagingEmailReceivedSchema,
        WebhookMessagingEmailDeletedSchema,
        WebhookMessagingChatUpdatedSchema,
        WebhookMessagingChatDeletedSchema,
        WebhookMessagingCalendarChangedSchema,
        WebhookMessagingCalendarEventChangedSchema,
        WebhookMessagingRelationCreatedSchema,
        UserDtoSchema,
        RoutineDtoSchema,
        WebhookPublicDtoSchema,
        ConnectedAccountDtoSchema,
        MessagingThreadSchema,
        GetMessagingThreadResultSchema,
        SendChatMessageSchema,
        SendEmailSchema,
        StartChatInputSchema,
      },
      securitySchemes: {
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description:
            "API key authentication. Create an API key in your user profile and include it in the x-api-key header.",
        },
      },
    },
  });

  return document;
}
