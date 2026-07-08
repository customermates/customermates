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
import { webhookContactCreatedOperation } from "@/features/contacts/webhooks/contact-created.openapi";
import { webhookContactUpdatedOperation } from "@/features/contacts/webhooks/contact-updated.openapi";
import { webhookContactDeletedOperation } from "@/features/contacts/webhooks/contact-deleted.openapi";
import { getOrganizationsOperation } from "@/features/organizations/get/get-organizations.openapi";
import { getOrganizationsConfigurationOperation } from "@/features/organizations/get/get-organizations-configuration.openapi";
import { getOrganizationByIdOperation } from "@/features/organizations/get/get-organization-by-id.openapi";
import { deleteOrganizationOperation } from "@/features/organizations/delete/delete-organization.openapi";
import { deleteManyOrganizationsOperation } from "@/features/organizations/delete/delete-many-organizations.openapi";
import { createOrganizationOperation } from "@/features/organizations/upsert/create-organization.openapi";
import { createManyOrganizationsOperation } from "@/features/organizations/upsert/create-many-organizations.openapi";
import { updateOrganizationOperation } from "@/features/organizations/upsert/update-organization.openapi";
import { updateManyOrganizationsOperation } from "@/features/organizations/upsert/update-many-organizations.openapi";
import { webhookOrganizationCreatedOperation } from "@/features/organizations/webhooks/organization-created.openapi";
import { webhookOrganizationUpdatedOperation } from "@/features/organizations/webhooks/organization-updated.openapi";
import { webhookOrganizationDeletedOperation } from "@/features/organizations/webhooks/organization-deleted.openapi";
import { getDealsOperation } from "@/features/deals/get/get-deals.openapi";
import { getDealsConfigurationOperation } from "@/features/deals/get/get-deals-configuration.openapi";
import { getDealByIdOperation } from "@/features/deals/get/get-deal-by-id.openapi";
import { deleteDealOperation } from "@/features/deals/delete/delete-deal.openapi";
import { deleteManyDealsOperation } from "@/features/deals/delete/delete-many-deals.openapi";
import { createDealOperation } from "@/features/deals/upsert/create-deal.openapi";
import { createManyDealsOperation } from "@/features/deals/upsert/create-many-deals.openapi";
import { updateDealOperation } from "@/features/deals/upsert/update-deal.openapi";
import { updateManyDealsOperation } from "@/features/deals/upsert/update-many-deals.openapi";
import { webhookDealCreatedOperation } from "@/features/deals/webhooks/deal-created.openapi";
import { webhookDealUpdatedOperation } from "@/features/deals/webhooks/deal-updated.openapi";
import { webhookDealDeletedOperation } from "@/features/deals/webhooks/deal-deleted.openapi";
import { getServicesOperation } from "@/features/services/get/get-services.openapi";
import { getServicesConfigurationOperation } from "@/features/services/get/get-services-configuration.openapi";
import { getServiceByIdOperation } from "@/features/services/get/get-service-by-id.openapi";
import { deleteServiceOperation } from "@/features/services/delete/delete-service.openapi";
import { deleteManyServicesOperation } from "@/features/services/delete/delete-many-services.openapi";
import { createServiceOperation } from "@/features/services/upsert/create-service.openapi";
import { createManyServicesOperation } from "@/features/services/upsert/create-many-services.openapi";
import { updateServiceOperation } from "@/features/services/upsert/update-service.openapi";
import { updateManyServicesOperation } from "@/features/services/upsert/update-many-services.openapi";
import { webhookServiceCreatedOperation } from "@/features/services/webhooks/service-created.openapi";
import { webhookServiceUpdatedOperation } from "@/features/services/webhooks/service-updated.openapi";
import { webhookServiceDeletedOperation } from "@/features/services/webhooks/service-deleted.openapi";
import { getTasksOperation } from "@/features/tasks/get/get-tasks.openapi";
import { getTasksConfigurationOperation } from "@/features/tasks/get/get-tasks-configuration.openapi";
import { getTaskByIdOperation } from "@/features/tasks/get/get-task-by-id.openapi";
import { deleteTaskOperation } from "@/features/tasks/delete/delete-task.openapi";
import { deleteManyTasksOperation } from "@/features/tasks/delete/delete-many-tasks.openapi";
import { createTaskOperation } from "@/features/tasks/upsert/create-task.openapi";
import { createManyTasksOperation } from "@/features/tasks/upsert/create-many-tasks.openapi";
import { updateTaskOperation } from "@/features/tasks/upsert/update-task.openapi";
import { updateManyTasksOperation } from "@/features/tasks/upsert/update-many-tasks.openapi";
import { webhookTaskCreatedOperation } from "@/features/tasks/webhooks/task-created.openapi";
import { webhookTaskUpdatedOperation } from "@/features/tasks/webhooks/task-updated.openapi";
import { webhookTaskDeletedOperation } from "@/features/tasks/webhooks/task-deleted.openapi";
import { getUsersOperation } from "@/features/user/get/get-users.openapi";
import { getUserProfileOperation } from "@/features/user/get/get-user-profile.openapi";
import { getConnectedAccountsOperation } from "@/features/messaging/connect/get-my-connected-accounts.openapi";
import { getMessagingThreadsOperation } from "@/features/messaging/inbox/get-messaging-threads.openapi";
import { getMessagingThreadOperation } from "@/features/messaging/inbox/get-messaging-thread.openapi";
import { sendChatMessageOperation } from "@/features/messaging/outbound/send-chat-message.openapi";
import { getActivitiesOperation } from "@/features/messaging/activities/get-activities.openapi";
import { sendEmailOperation } from "@/features/messaging/outbound/send-email.openapi";
import { startChatOperation } from "@/features/messaging/outbound/start-chat.openapi";
import { saveDraftOperation } from "@/features/messaging/outbound/save-draft.openapi";
import { discardDraftOperation } from "@/features/messaging/outbound/discard-draft.openapi";
import { getSocialPostsOperation } from "@/features/messaging/posts/list-social-posts.openapi";
import { getSocialPostEngagementOperation } from "@/features/messaging/posts/list-social-post-comments.openapi";
import { getSocialProfileOperation } from "@/features/messaging/posts/social-profiles.openapi";
import { searchSalesNavigatorOperation } from "@/features/messaging/sales-navigator/search-sales-navigator.openapi";
import { searchSalesPeopleOperation } from "@/features/messaging/sales-navigator/search-sales-people.openapi";
import { searchSalesCompaniesOperation } from "@/features/messaging/sales-navigator/search-sales-companies.openapi";
import { listSalesSearchParametersOperation } from "@/features/messaging/sales-navigator/list-sales-search-parameters.openapi";
import { listSalesListsOperation } from "@/features/messaging/sales-navigator/list-sales-lists.openapi";
import { browseSalesListOperation } from "@/features/messaging/sales-navigator/browse-sales-list.openapi";
import { saveToSalesListOperation } from "@/features/messaging/sales-navigator/save-to-sales-list.openapi";
import { listRelationRequestsOperation } from "@/features/messaging/posts/list-relation-requests.openapi";
import { createRelationRequestOperation } from "@/features/messaging/posts/create-relation-request.openapi";
import { acceptRelationRequestOperation } from "@/features/messaging/posts/accept-relation-request.openapi";
import { cancelRelationRequestOperation } from "@/features/messaging/posts/cancel-relation-request.openapi";
import { ErrorResponseSchema } from "@/core/api/interactor-handler";
import { DeleteContactSchema } from "@/features/contacts/delete/delete-contact.interactor";
import { DeleteManyContactsSchema } from "@/features/contacts/delete/delete-many-contacts.interactor";
import { GetContactByIdSchema } from "@/features/contacts/get/get-contact-by-id.interactor";
import { CreateContactSchema } from "@/features/contacts/upsert/create-contact.interactor";
import { CreateManyContactsSchema } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { UpdateContactSchema } from "@/features/contacts/upsert/update-contact.interactor";
import { UpdateManyContactsSchema } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { webhookMessagingMessageReceivedOperation } from "@/features/messaging/webhooks/message-received.openapi";
import { webhookMessagingMessageUpdatedOperation } from "@/features/messaging/webhooks/message-updated.openapi";
import { webhookMessagingMessageDeletedOperation } from "@/features/messaging/webhooks/message-deleted.openapi";
import { webhookMessagingMessageReactionOperation } from "@/features/messaging/webhooks/message-reaction.openapi";
import { webhookMessagingEmailReceivedOperation } from "@/features/messaging/webhooks/email-received.openapi";
import { webhookMessagingEmailDeletedOperation } from "@/features/messaging/webhooks/email-deleted.openapi";
import { webhookMessagingChatUpdatedOperation } from "@/features/messaging/webhooks/chat-updated.openapi";
import { webhookMessagingChatDeletedOperation } from "@/features/messaging/webhooks/chat-deleted.openapi";
import { webhookMessagingCalendarChangedOperation } from "@/features/messaging/webhooks/calendar-changed.openapi";
import { webhookMessagingCalendarEventChangedOperation } from "@/features/messaging/webhooks/calendar-event-changed.openapi";
import { webhookMessagingRelationCreatedOperation } from "@/features/messaging/webhooks/relation-created.openapi";
import { WebhookContactCreatedSchema } from "@/features/contacts/webhooks/contact-created.openapi";
import { WebhookContactUpdatedSchema } from "@/features/contacts/webhooks/contact-updated.openapi";
import { WebhookContactDeletedSchema } from "@/features/contacts/webhooks/contact-deleted.openapi";
import { env } from "@/env";
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
import { WebhookOrganizationCreatedSchema } from "@/features/organizations/webhooks/organization-created.openapi";
import { WebhookOrganizationUpdatedSchema } from "@/features/organizations/webhooks/organization-updated.openapi";
import { WebhookOrganizationDeletedSchema } from "@/features/organizations/webhooks/organization-deleted.openapi";
import { WebhookDealCreatedSchema } from "@/features/deals/webhooks/deal-created.openapi";
import { WebhookDealUpdatedSchema } from "@/features/deals/webhooks/deal-updated.openapi";
import { WebhookDealDeletedSchema } from "@/features/deals/webhooks/deal-deleted.openapi";
import { WebhookServiceCreatedSchema } from "@/features/services/webhooks/service-created.openapi";
import { WebhookServiceUpdatedSchema } from "@/features/services/webhooks/service-updated.openapi";
import { WebhookServiceDeletedSchema } from "@/features/services/webhooks/service-deleted.openapi";
import { WebhookTaskCreatedSchema } from "@/features/tasks/webhooks/task-created.openapi";
import { WebhookTaskUpdatedSchema } from "@/features/tasks/webhooks/task-updated.openapi";
import { WebhookTaskDeletedSchema } from "@/features/tasks/webhooks/task-deleted.openapi";
import { WebhookMessagingMessageReceivedSchema } from "@/features/messaging/webhooks/message-received.openapi";
import { WebhookMessagingMessageUpdatedSchema } from "@/features/messaging/webhooks/message-updated.openapi";
import { WebhookMessagingMessageDeletedSchema } from "@/features/messaging/webhooks/message-deleted.openapi";
import { WebhookMessagingMessageReactionSchema } from "@/features/messaging/webhooks/message-reaction.openapi";
import { WebhookMessagingEmailReceivedSchema } from "@/features/messaging/webhooks/email-received.openapi";
import { WebhookMessagingEmailDeletedSchema } from "@/features/messaging/webhooks/email-deleted.openapi";
import { WebhookMessagingChatUpdatedSchema } from "@/features/messaging/webhooks/chat-updated.openapi";
import { WebhookMessagingChatDeletedSchema } from "@/features/messaging/webhooks/chat-deleted.openapi";
import { WebhookMessagingCalendarChangedSchema } from "@/features/messaging/webhooks/calendar-changed.openapi";
import { WebhookMessagingCalendarEventChangedSchema } from "@/features/messaging/webhooks/calendar-event-changed.openapi";
import { WebhookMessagingRelationCreatedSchema } from "@/features/messaging/webhooks/relation-created.openapi";
import { UserDtoSchema } from "@/features/user/user.schema";
import { ConnectedAccountDtoSchema, MessagingThreadSchema } from "@/ee/messaging/messaging.schema";
import { GetMessagingThreadResultSchema } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import { SendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { ActivitiesParamsSchema, ActivitiesResultSchema } from "@/ee/messaging/activities/activities.schema";
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
        url: `${env.BASE_URL}/api`,
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
        get: getUserProfileOperation,
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
        post: searchSalesNavigatorOperation,
      },
      "/v1/messaging/sales-navigator/search/people": {
        post: searchSalesPeopleOperation,
      },
      "/v1/messaging/sales-navigator/search/companies": {
        post: searchSalesCompaniesOperation,
      },
      "/v1/messaging/sales-navigator/search/parameters": {
        post: listSalesSearchParametersOperation,
      },
      "/v1/messaging/sales-navigator/lists/search": {
        post: listSalesListsOperation,
      },
      "/v1/messaging/sales-navigator/lists/browse": {
        post: browseSalesListOperation,
      },
      "/v1/messaging/sales-navigator/lists/save": {
        post: saveToSalesListOperation,
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
        ActivitiesParamsSchema,
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
