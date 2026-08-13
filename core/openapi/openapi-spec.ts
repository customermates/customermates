import { createDocument } from "zod-openapi";

import { deleteContactOperation } from "@/features/contacts/delete/delete-contact.openapi";
import { deleteManyContactsOperation } from "@/features/contacts/delete/delete-many-contacts.openapi";
import { getContactsOperation } from "@/features/contacts/get/get-contacts.openapi";
import { createContactOperation } from "@/features/contacts/upsert/create-contact.openapi";
import { createManyContactsOperation } from "@/features/contacts/upsert/create-many-contacts.openapi";
import { updateContactOperation } from "@/features/contacts/upsert/update-contact.openapi";
import { updateManyContactsOperation } from "@/features/contacts/upsert/update-many-contacts.openapi";
import { getContactByIdOperation } from "@/features/contacts/get/get-contact-by-id.openapi";
import { getContactsConfigurationOperation } from "@/features/contacts/get/get-contacts-configuration.openapi";
import { webhookContactCreatedOperation } from "@/features/contacts/upsert/contact-created.openapi";
import { webhookContactUpdatedOperation } from "@/features/contacts/upsert/contact-updated.openapi";
import { webhookContactDeletedOperation } from "@/features/contacts/delete/contact-deleted.openapi";
import { getOrganizationsOperation } from "@/features/organizations/get/get-organizations.openapi";
import { getOrganizationsConfigurationOperation } from "@/features/organizations/get/get-organizations-configuration.openapi";
import { getOrganizationByIdOperation } from "@/features/organizations/get/get-organization-by-id.openapi";
import { deleteOrganizationOperation } from "@/features/organizations/delete/delete-organization.openapi";
import { deleteManyOrganizationsOperation } from "@/features/organizations/delete/delete-many-organizations.openapi";
import { createOrganizationOperation } from "@/features/organizations/upsert/create-organization.openapi";
import { createManyOrganizationsOperation } from "@/features/organizations/upsert/create-many-organizations.openapi";
import { updateOrganizationOperation } from "@/features/organizations/upsert/update-organization.openapi";
import { updateManyOrganizationsOperation } from "@/features/organizations/upsert/update-many-organizations.openapi";
import { webhookOrganizationCreatedOperation } from "@/features/organizations/upsert/organization-created.openapi";
import { webhookOrganizationUpdatedOperation } from "@/features/organizations/upsert/organization-updated.openapi";
import { webhookOrganizationDeletedOperation } from "@/features/organizations/delete/organization-deleted.openapi";
import { getDealsOperation } from "@/features/deals/get/get-deals.openapi";
import { getDealsConfigurationOperation } from "@/features/deals/get/get-deals-configuration.openapi";
import { getDealByIdOperation } from "@/features/deals/get/get-deal-by-id.openapi";
import { deleteDealOperation } from "@/features/deals/delete/delete-deal.openapi";
import { deleteManyDealsOperation } from "@/features/deals/delete/delete-many-deals.openapi";
import { createDealOperation } from "@/features/deals/upsert/create-deal.openapi";
import { createManyDealsOperation } from "@/features/deals/upsert/create-many-deals.openapi";
import { updateDealOperation } from "@/features/deals/upsert/update-deal.openapi";
import { updateManyDealsOperation } from "@/features/deals/upsert/update-many-deals.openapi";
import { webhookDealCreatedOperation } from "@/features/deals/upsert/deal-created.openapi";
import { webhookDealUpdatedOperation } from "@/features/deals/upsert/deal-updated.openapi";
import { webhookDealDeletedOperation } from "@/features/deals/delete/deal-deleted.openapi";
import { getServicesOperation } from "@/features/services/get/get-services.openapi";
import { getServicesConfigurationOperation } from "@/features/services/get/get-services-configuration.openapi";
import { getServiceByIdOperation } from "@/features/services/get/get-service-by-id.openapi";
import { deleteServiceOperation } from "@/features/services/delete/delete-service.openapi";
import { deleteManyServicesOperation } from "@/features/services/delete/delete-many-services.openapi";
import { createServiceOperation } from "@/features/services/upsert/create-service.openapi";
import { createManyServicesOperation } from "@/features/services/upsert/create-many-services.openapi";
import { updateServiceOperation } from "@/features/services/upsert/update-service.openapi";
import { updateManyServicesOperation } from "@/features/services/upsert/update-many-services.openapi";
import { webhookServiceCreatedOperation } from "@/features/services/upsert/service-created.openapi";
import { webhookServiceUpdatedOperation } from "@/features/services/upsert/service-updated.openapi";
import { webhookServiceDeletedOperation } from "@/features/services/delete/service-deleted.openapi";
import { getTasksOperation } from "@/features/tasks/get/get-tasks.openapi";
import { getTasksConfigurationOperation } from "@/features/tasks/get/get-tasks-configuration.openapi";
import { getTaskByIdOperation } from "@/features/tasks/get/get-task-by-id.openapi";
import { deleteTaskOperation } from "@/features/tasks/delete/delete-task.openapi";
import { deleteManyTasksOperation } from "@/features/tasks/delete/delete-many-tasks.openapi";
import { createTaskOperation } from "@/features/tasks/upsert/create-task.openapi";
import { createManyTasksOperation } from "@/features/tasks/upsert/create-many-tasks.openapi";
import { updateTaskOperation } from "@/features/tasks/upsert/update-task.openapi";
import { updateManyTasksOperation } from "@/features/tasks/upsert/update-many-tasks.openapi";
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
import { saveDraftOperation } from "@/ee/messaging/outbound/save-draft.openapi";
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
import { DeleteContactSchema } from "@/features/contacts/delete/delete-contact.interactor";
import { DeleteManyContactsSchema } from "@/features/contacts/delete/delete-many-contacts.interactor";
import { GetContactByIdSchema } from "@/features/contacts/get/get-contact-by-id.interactor";
import { CreateContactSchema } from "@/features/contacts/upsert/create-contact.interactor";
import { CreateManyContactsSchema } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { UpdateContactSchema } from "@/features/contacts/upsert/update-contact.interactor";
import { UpdateManyContactsSchema } from "@/features/contacts/upsert/update-many-contacts.interactor";
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
import { DeleteDealSchema } from "@/features/deals/delete/delete-deal.interactor";
import { DeleteOrganizationSchema } from "@/features/organizations/delete/delete-organization.interactor";
import { DeleteServiceSchema } from "@/features/services/delete/delete-service.interactor";
import { DeleteTaskSchema } from "@/features/tasks/delete/delete-task.interactor";
import { CreateOrganizationSchema } from "@/features/organizations/upsert/create-organization.interactor";
import { CreateManyOrganizationsSchema } from "@/features/organizations/upsert/create-many-organizations.interactor";
import { UpdateOrganizationSchema } from "@/features/organizations/upsert/update-organization.interactor";
import { UpdateManyOrganizationsSchema } from "@/features/organizations/upsert/update-many-organizations.interactor";
import { DeleteManyOrganizationsSchema } from "@/features/organizations/delete/delete-many-organizations.interactor";
import { GetOrganizationByIdSchema } from "@/features/organizations/get/get-organization-by-id.interactor";
import { CreateDealSchema } from "@/features/deals/upsert/create-deal.interactor";
import { CreateManyDealsSchema } from "@/features/deals/upsert/create-many-deals.interactor";
import { UpdateDealSchema } from "@/features/deals/upsert/update-deal.interactor";
import { UpdateManyDealsSchema } from "@/features/deals/upsert/update-many-deals.interactor";
import { DeleteManyDealsSchema } from "@/features/deals/delete/delete-many-deals.interactor";
import { GetDealByIdSchema } from "@/features/deals/get/get-deal-by-id.interactor";
import { CreateServiceSchema } from "@/features/services/upsert/create-service.interactor";
import { CreateManyServicesSchema } from "@/features/services/upsert/create-many-services.interactor";
import { UpdateServiceSchema } from "@/features/services/upsert/update-service.interactor";
import { UpdateManyServicesSchema } from "@/features/services/upsert/update-many-services.interactor";
import { DeleteManyServicesSchema } from "@/features/services/delete/delete-many-services.interactor";
import { GetServiceByIdSchema } from "@/features/services/get/get-service-by-id.interactor";
import { CreateTaskSchema } from "@/features/tasks/upsert/create-task.interactor";
import { CreateManyTasksSchema } from "@/features/tasks/upsert/create-many-tasks.interactor";
import { UpdateTaskSchema } from "@/features/tasks/upsert/update-task.interactor";
import { UpdateManyTasksSchema } from "@/features/tasks/upsert/update-many-tasks.interactor";
import { DeleteManyTasksSchema } from "@/features/tasks/delete/delete-many-tasks.interactor";
import { GetTaskByIdSchema } from "@/features/tasks/get/get-task-by-id.interactor";
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
      "/v1/contacts": {
        post: createContactOperation,
      },
      "/v1/contacts/many": {
        post: createManyContactsOperation,
        put: updateManyContactsOperation,
        delete: deleteManyContactsOperation,
      },
      "/v1/contacts/search": {
        post: getContactsOperation,
      },
      "/v1/contacts/configuration": {
        get: getContactsConfigurationOperation,
      },
      "/v1/contacts/{id}": {
        get: getContactByIdOperation,
        put: updateContactOperation,
        delete: deleteContactOperation,
      },
      "/v1/organizations": {
        post: createOrganizationOperation,
      },
      "/v1/organizations/many": {
        post: createManyOrganizationsOperation,
        put: updateManyOrganizationsOperation,
        delete: deleteManyOrganizationsOperation,
      },
      "/v1/organizations/search": {
        post: getOrganizationsOperation,
      },
      "/v1/organizations/configuration": {
        get: getOrganizationsConfigurationOperation,
      },
      "/v1/organizations/{id}": {
        get: getOrganizationByIdOperation,
        put: updateOrganizationOperation,
        delete: deleteOrganizationOperation,
      },
      "/v1/deals": {
        post: createDealOperation,
      },
      "/v1/deals/many": {
        post: createManyDealsOperation,
        put: updateManyDealsOperation,
        delete: deleteManyDealsOperation,
      },
      "/v1/deals/search": {
        post: getDealsOperation,
      },
      "/v1/deals/configuration": {
        get: getDealsConfigurationOperation,
      },
      "/v1/deals/{id}": {
        get: getDealByIdOperation,
        put: updateDealOperation,
        delete: deleteDealOperation,
      },
      "/v1/services": {
        post: createServiceOperation,
      },
      "/v1/services/many": {
        post: createManyServicesOperation,
        put: updateManyServicesOperation,
        delete: deleteManyServicesOperation,
      },
      "/v1/services/search": {
        post: getServicesOperation,
      },
      "/v1/services/configuration": {
        get: getServicesConfigurationOperation,
      },
      "/v1/services/{id}": {
        get: getServiceByIdOperation,
        put: updateServiceOperation,
        delete: deleteServiceOperation,
      },
      "/v1/tasks": {
        post: createTaskOperation,
      },
      "/v1/tasks/many": {
        post: createManyTasksOperation,
        put: updateManyTasksOperation,
        delete: deleteManyTasksOperation,
      },
      "/v1/tasks/search": {
        post: getTasksOperation,
      },
      "/v1/tasks/configuration": {
        get: getTasksConfigurationOperation,
      },
      "/v1/tasks/{id}": {
        get: getTaskByIdOperation,
        put: updateTaskOperation,
        delete: deleteTaskOperation,
      },
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
        DeleteContactSchema,
        DeleteManyContactsSchema,
        CreateContactSchema,
        CreateManyContactsSchema,
        UpdateContactSchema,
        UpdateManyContactsSchema,
        GetContactByIdSchema,
        DeleteOrganizationSchema,
        DeleteManyOrganizationsSchema,
        CreateOrganizationSchema,
        CreateManyOrganizationsSchema,
        UpdateOrganizationSchema,
        UpdateManyOrganizationsSchema,
        GetOrganizationByIdSchema,
        DeleteDealSchema,
        DeleteManyDealsSchema,
        CreateDealSchema,
        CreateManyDealsSchema,
        UpdateDealSchema,
        UpdateManyDealsSchema,
        GetDealByIdSchema,
        DeleteServiceSchema,
        DeleteManyServicesSchema,
        CreateServiceSchema,
        CreateManyServicesSchema,
        UpdateServiceSchema,
        UpdateManyServicesSchema,
        GetServiceByIdSchema,
        DeleteTaskSchema,
        DeleteManyTasksSchema,
        CreateTaskSchema,
        CreateManyTasksSchema,
        UpdateTaskSchema,
        UpdateManyTasksSchema,
        GetTaskByIdSchema,
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
