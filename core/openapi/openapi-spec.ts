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
import { ErrorResponseSchema } from "@/core/api/interactor-handler";
import { DeleteContactSchema } from "@/features/contacts/delete/delete-contact.interactor";
import { DeleteManyContactsSchema } from "@/features/contacts/delete/delete-many-contacts.interactor";
import { GetContactByIdSchema } from "@/features/contacts/get/get-contact-by-id.interactor";
import { CreateContactSchema } from "@/features/contacts/upsert/create-contact.interactor";
import { CreateManyContactsSchema } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { UpdateContactSchema } from "@/features/contacts/upsert/update-contact.interactor";
import { UpdateManyContactsSchema } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { WebhookContactCreatedSchema } from "@/features/contacts/webhooks/contact-created.openapi";
import { WebhookContactUpdatedSchema } from "@/features/contacts/webhooks/contact-updated.openapi";
import { WebhookContactDeletedSchema } from "@/features/contacts/webhooks/contact-deleted.openapi";
import { BASE_URL } from "@/constants/env";
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
import { UserDtoSchema } from "@/features/user/user.schema";

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
        url: `${BASE_URL}/api`,
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
        UserDtoSchema,
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
