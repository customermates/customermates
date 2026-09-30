import { recordWebhookOperations } from "@/features/records/record-webhooks.openapi";
import { createDocument } from "zod-openapi";

import { webhookContactCreatedOperation } from "@/features/contacts/upsert/contact-created.openapi";
import { webhookContactUpdatedOperation } from "@/features/contacts/upsert/contact-updated.openapi";
import { webhookContactDeletedOperation } from "@/features/contacts/delete/contact-deleted.openapi";
import { webhookOrganizationCreatedOperation } from "@/features/organizations/upsert/organization-created.openapi";
import { webhookOrganizationUpdatedOperation } from "@/features/organizations/upsert/organization-updated.openapi";
import { webhookOrganizationDeletedOperation } from "@/features/organizations/delete/organization-deleted.openapi";
import { webhookDealCreatedOperation } from "@/features/deals/upsert/deal-created.openapi";
import { webhookDealUpdatedOperation } from "@/features/deals/upsert/deal-updated.openapi";
import { webhookDealDeletedOperation } from "@/features/deals/delete/deal-deleted.openapi";
import { webhookServiceCreatedOperation } from "@/features/services/upsert/service-created.openapi";
import { webhookServiceUpdatedOperation } from "@/features/services/upsert/service-updated.openapi";
import { webhookServiceDeletedOperation } from "@/features/services/delete/service-deleted.openapi";
import { webhookTaskCreatedOperation } from "@/features/tasks/upsert/task-created.openapi";
import { webhookTaskUpdatedOperation } from "@/features/tasks/upsert/task-updated.openapi";
import { webhookTaskDeletedOperation } from "@/features/tasks/delete/task-deleted.openapi";
import { getUsersOperation } from "@/features/user/get/get-users.openapi";
import { getUserDetailsOperation } from "@/features/user/get/get-user-details.openapi";
import { createWebhookOperation } from "@/features/webhook/create-webhook.openapi";
import { getWebhookOperation } from "@/features/webhook/get-webhook.openapi";
import { deleteWebhookOperation } from "@/features/webhook/delete-webhook.openapi";
import { getConnectedAccountsOperation } from "@/ee/messaging/connect/get-my-connected-accounts.openapi";
import { getMessagingThreadsOperation } from "@/ee/messaging/inbox/get-messaging-threads.openapi";
import { getMessagingThreadOperation } from "@/ee/messaging/inbox/get-messaging-thread.openapi";
import { sendChatMessageOperation } from "@/ee/messaging/outbound/send-chat-message.openapi";
import { getActivitiesOperation } from "@/ee/messaging/activities/get-activities.openapi";
import { getCalendarsOperation } from "@/ee/calendar/get-calendars.openapi";
import { getCalendarByIdOperation } from "@/ee/calendar/get-calendar-by-id.openapi";
import { getCalendarEventsOperation } from "@/ee/calendar/get-calendar-events.openapi";
import { getCalendarEventByIdOperation } from "@/ee/calendar/get-calendar-event-by-id.openapi";
import { sendEmailOperation } from "@/ee/messaging/outbound/send-email.openapi";
import { startChatOperation } from "@/ee/messaging/outbound/start-chat.openapi";
import { saveDraftOperation, saveNewThreadDraftOperation } from "@/ee/messaging/outbound/save-draft.openapi";
import { discardDraftOperation } from "@/ee/messaging/outbound/discard-draft.openapi";
import { getSocialPostsOperation } from "@/ee/messaging/posts/list-social-posts.openapi";
import { getSocialPostEngagementOperation } from "@/ee/messaging/posts/list-social-post-comments.openapi";
import { getSocialProfileOperation } from "@/ee/messaging/posts/get-social-profile.openapi";
import { linkedinSearchSalesNavigatorOperation } from "@/ee/messaging/sales-navigator/linkedin-search-sales-navigator.openapi";
import { linkedinSearchSalesPeopleOperation } from "@/ee/messaging/sales-navigator/linkedin-search-sales-people.openapi";
import { linkedinSearchSalesCompaniesOperation } from "@/ee/messaging/sales-navigator/linkedin-search-sales-companies.openapi";
import { linkedinListSalesSearchParametersOperation } from "@/ee/messaging/sales-navigator/linkedin-list-sales-search-parameters.openapi";
import { linkedinListSalesListsOperation } from "@/ee/messaging/sales-navigator/linkedin-list-sales-lists.openapi";
import { linkedinBrowseSalesListOperation } from "@/ee/messaging/sales-navigator/linkedin-browse-sales-list.openapi";
import { linkedinSaveToSalesListOperation } from "@/ee/messaging/sales-navigator/linkedin-save-to-sales-list.openapi";
import { listRelationRequestsOperation } from "@/ee/messaging/posts/list-relation-requests.openapi";
import { createRelationRequestOperation } from "@/ee/messaging/posts/create-relation-request.openapi";
import { acceptRelationRequestOperation } from "@/ee/messaging/posts/accept-relation-request.openapi";
import { cancelRelationRequestOperation } from "@/ee/messaging/posts/cancel-relation-request.openapi";
import { ErrorResponseSchema } from "@/core/api/interactor-handler";
import { webhookMessagingMessageReceivedOperation } from "@/ee/messaging/webhooks/message/message-received.openapi";
import { webhookMessagingMessageUpdatedOperation } from "@/ee/messaging/webhooks/message/message-updated.openapi";
import { webhookMessagingMessageDeletedOperation } from "@/ee/messaging/webhooks/message/message-deleted.openapi";
import { webhookMessagingMessageReactionOperation } from "@/ee/messaging/webhooks/message/message-reaction.openapi";
import { webhookMessagingEmailReceivedOperation } from "@/ee/messaging/webhooks/email/email-received.openapi";
import { webhookMessagingEmailDeletedOperation } from "@/ee/messaging/webhooks/email/email-deleted.openapi";
import { webhookMessagingChatUpdatedOperation } from "@/ee/messaging/webhooks/chat/chat-updated.openapi";
import { webhookMessagingChatDeletedOperation } from "@/ee/messaging/webhooks/chat/chat-deleted.openapi";
import { webhookMessagingCalendarChangedOperation } from "@/ee/messaging/webhooks/calendar/calendar-changed.openapi";
import { webhookMessagingCalendarEventChangedOperation } from "@/ee/messaging/webhooks/calendar/calendar-event-changed.openapi";
import { webhookMessagingRelationCreatedOperation } from "@/ee/messaging/webhooks/relation/relation-created.openapi";
import { WebhookContactCreatedSchema } from "@/features/contacts/upsert/contact-created.openapi";
import { WebhookContactUpdatedSchema } from "@/features/contacts/upsert/contact-updated.openapi";
import { WebhookContactDeletedSchema } from "@/features/contacts/delete/contact-deleted.openapi";
import { WebhookOrganizationCreatedSchema } from "@/features/organizations/upsert/organization-created.openapi";
import { WebhookOrganizationUpdatedSchema } from "@/features/organizations/upsert/organization-updated.openapi";
import { WebhookOrganizationDeletedSchema } from "@/features/organizations/delete/organization-deleted.openapi";
import { WebhookDealCreatedSchema } from "@/features/deals/upsert/deal-created.openapi";
import { WebhookDealUpdatedSchema } from "@/features/deals/upsert/deal-updated.openapi";
import { WebhookDealDeletedSchema } from "@/features/deals/delete/deal-deleted.openapi";
import { WebhookServiceCreatedSchema } from "@/features/services/upsert/service-created.openapi";
import { WebhookServiceUpdatedSchema } from "@/features/services/upsert/service-updated.openapi";
import { WebhookServiceDeletedSchema } from "@/features/services/delete/service-deleted.openapi";
import { WebhookTaskCreatedSchema } from "@/features/tasks/upsert/task-created.openapi";
import { WebhookTaskUpdatedSchema } from "@/features/tasks/upsert/task-updated.openapi";
import { WebhookTaskDeletedSchema } from "@/features/tasks/delete/task-deleted.openapi";
import { WebhookMessagingMessageReceivedSchema } from "@/ee/messaging/webhooks/message/message-received.openapi";
import { WebhookMessagingMessageUpdatedSchema } from "@/ee/messaging/webhooks/message/message-updated.openapi";
import { WebhookMessagingMessageDeletedSchema } from "@/ee/messaging/webhooks/message/message-deleted.openapi";
import { WebhookMessagingMessageReactionSchema } from "@/ee/messaging/webhooks/message/message-reaction.openapi";
import { WebhookMessagingEmailReceivedSchema } from "@/ee/messaging/webhooks/email/email-received.openapi";
import { WebhookMessagingEmailDeletedSchema } from "@/ee/messaging/webhooks/email/email-deleted.openapi";
import { WebhookMessagingChatUpdatedSchema } from "@/ee/messaging/webhooks/chat/chat-updated.openapi";
import { WebhookMessagingChatDeletedSchema } from "@/ee/messaging/webhooks/chat/chat-deleted.openapi";
import { WebhookMessagingCalendarChangedSchema } from "@/ee/messaging/webhooks/calendar/calendar-changed.openapi";
import { WebhookMessagingCalendarEventChangedSchema } from "@/ee/messaging/webhooks/calendar/calendar-event-changed.openapi";
import { WebhookMessagingRelationCreatedSchema } from "@/ee/messaging/webhooks/relation/relation-created.openapi";
import { UserDtoSchema } from "@/features/user/user.schema";
import { ConnectedAccountDtoSchema, MessagingThreadSchema } from "@/ee/messaging/messaging.schema";
import { GetMessagingThreadResultSchema } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import { SendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { ActivitiesApiParamsSchema, ActivitiesResultSchema } from "@/ee/messaging/activities/activities.schema";
import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { StartChatInputSchema } from "@/ee/messaging/outbound/start-chat.interactor";

import { recordApiPaths } from "@/features/records/records.openapi";

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
      "/v1/users/search": {
        post: getUsersOperation,
      },
      "/v1/users/me": {
        get: getUserDetailsOperation,
      },
      "/v1/webhooks": {
        post: createWebhookOperation,
      },
      "/v1/webhooks/{id}": {
        get: getWebhookOperation,
        delete: deleteWebhookOperation,
      },
      "/v1/messaging/connected-accounts": {
        get: getConnectedAccountsOperation,
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
      "/v1/messaging/activities/search": {
        post: getActivitiesOperation,
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
      contactCreated: {
        post: webhookContactCreatedOperation,
      },
      contactUpdated: {
        post: webhookContactUpdatedOperation,
      },
      contactDeleted: {
        post: webhookContactDeletedOperation,
      },
      organizationCreated: {
        post: webhookOrganizationCreatedOperation,
      },
      organizationUpdated: {
        post: webhookOrganizationUpdatedOperation,
      },
      organizationDeleted: {
        post: webhookOrganizationDeletedOperation,
      },
      dealCreated: {
        post: webhookDealCreatedOperation,
      },
      dealUpdated: {
        post: webhookDealUpdatedOperation,
      },
      dealDeleted: {
        post: webhookDealDeletedOperation,
      },
      serviceCreated: {
        post: webhookServiceCreatedOperation,
      },
      serviceUpdated: {
        post: webhookServiceUpdatedOperation,
      },
      serviceDeleted: {
        post: webhookServiceDeletedOperation,
      },
      taskCreated: {
        post: webhookTaskCreatedOperation,
      },
      taskUpdated: {
        post: webhookTaskUpdatedOperation,
      },
      taskDeleted: {
        post: webhookTaskDeletedOperation,
      },
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
        ErrorResponseSchema,
        WebhookContactCreatedSchema,
        WebhookContactUpdatedSchema,
        WebhookContactDeletedSchema,
        WebhookOrganizationCreatedSchema,
        WebhookOrganizationUpdatedSchema,
        WebhookOrganizationDeletedSchema,
        WebhookDealCreatedSchema,
        WebhookDealUpdatedSchema,
        WebhookDealDeletedSchema,
        WebhookServiceCreatedSchema,
        WebhookServiceUpdatedSchema,
        WebhookServiceDeletedSchema,
        WebhookTaskCreatedSchema,
        WebhookTaskUpdatedSchema,
        WebhookTaskDeletedSchema,
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
        ConnectedAccountDtoSchema,
        MessagingThreadSchema,
        GetMessagingThreadResultSchema,
        SendChatMessageSchema,
        ActivitiesApiParamsSchema,
        ActivitiesResultSchema,
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
