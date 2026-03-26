import { Container } from "inversify";

import {
  CleanupInactiveUsersResourcesInteractor,
  CleanupInactiveUsersResourcesActionRepo,
} from "@/ee/lifecycle/cleanup-inactive-users-resources.interactor";
import {
  CleanupNonProCompaniesResourcesInteractor,
  CleanupNonProCompaniesResourcesRepo,
} from "@/ee/lifecycle/cleanup-non-pro-companies-resources.interactor";
import {
  StopInactiveUsersMachinesInteractor,
  StopInactiveUsersMachinesRepo,
} from "@/ee/lifecycle/stop-inactive-users-machines.interactor";
import {
  DeactivateTrialUsersAndSendNoticeInteractor,
  DeactivateTrialUsersAndSendNoticeRepo,
} from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import {
  DeactivateUsersAfterSubscriptionGracePeriodInteractor,
  DeactivateUsersAfterSubscriptionGracePeriodRepo,
} from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";
import {
  SendTrialExtensionOfferInteractor,
  SendTrialExtensionOfferActionRepo,
} from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import {
  SendTrialInactivationReminderInteractor,
  SendTrialInactivationReminderActionRepo,
} from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import {
  SendWelcomeAndDemoInteractor,
  SendWelcomeAndDemoActionRepo,
} from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import { P13nRepo } from "@/core/base/base-get.interactor";
import {
  InviteTokenValidationInteractor,
  InviteTokenRepo,
} from "@/features/company/invite-token-validation.interactor";
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";
import { AuthService } from "@/features/auth/auth.service";
import { RegisterUserRepo, RegisterUserInteractor } from "@/features/user/register/register-user.interactor";
import {
  UpdateUserDetailsRepo,
  UpdateUserDetailsInteractor,
} from "@/features/user/upsert/update-user-details.interactor";
import {
  UpdateUserSettingsRepo,
  UpdateUserSettingsInteractor,
} from "@/features/user/upsert/update-user-settings.interactor";
import { GetUserDetailsInteractor } from "@/features/user/get/get-user-details.interactor";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { CreateApiKeyInteractor } from "@/features/api-key/create-api-key.interactor";
import { GetApiKeysInteractor } from "@/features/api-key/get-api-keys.interactor";
import { DeleteApiKeyInteractor } from "@/features/api-key/delete-api-key.interactor";
import {
  AdminUpdateUserDetailsRepo,
  AdminUpdateUserDetailsInteractor,
  AdminUpdateUserSubscriptionRepo,
  UpdateUserRoleRepo,
} from "@/features/user/upsert/admin-update-user-details.interactor";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";
import { GetCompanyDetailsInteractor, GetCompanyDetailsRepo } from "@/features/company/get-company-details.interactor";
import {
  UpdateCompanyDetailsInteractor,
  UpdateCompanyDetailsRepo,
} from "@/features/company/update-company-details.interactor";
import { SendFeedbackInteractor } from "@/features/feedback/send-feedback.interactor";
import { GetUsersInteractor, GetUsersRepo } from "@/features/user/get/get-users.interactor";
import { GetUsersApiInteractor } from "@/features/user/get/get-users-api.interactor";
import {
  GetOrCreateInviteTokenInteractor,
  GetOrCreateInviteTokenRepo,
} from "@/features/company/get-or-create-invite-token.interactor";
import { UpsertRoleInteractor, UpsertRoleRepo } from "@/features/role/upsert-role.interactor";
import { GetRolesInteractor, GetRolesRepo } from "@/features/role/get-roles.interactor";
import { DeleteRoleInteractor, DeleteRoleRepo } from "@/features/role/delete-role.interactor";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";
import { TaskService, TaskRepo as TaskWorkerRepo } from "@/features/tasks/task.service";
import { PrismaTaskRepo } from "@/features/tasks/prisma-task.repository";
import { CompanyOnboardingTaskListener } from "@/features/tasks/listener/company-onboarding-task.listener";
import { UserPendingAuthorizationTaskListener } from "@/features/tasks/listener/user-pending-authorization-task.listener";
import { BaseTaskListener } from "@/features/tasks/listener/base-task.listener";
import { PrismaAuditLogRepo } from "@/ee/audit-log/prisma-audit-log.repository";
import {
  GetAuditLogsByEntityIdInteractor,
  GetAuditLogsByEntityIdRepo,
} from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";
import {
  GetEntityChangeHistoryByIdCustomColumnRepo,
  GetEntityChangeHistoryByIdAuditLogRepo,
  GetEntityChangeHistoryByIdInteractor,
} from "@/ee/audit-log/get/get-entity-change-history-by-id.interactor";
import { GetAuditLogsInteractor, GetAuditLogsRepo } from "@/ee/audit-log/get/get-audit-logs.interactor";
import { GetTasksInteractor, GetTasksRepo } from "@/features/tasks/get/get-tasks.interactor";
import { GetTasksApiInteractor } from "@/features/tasks/get/get-tasks-api.interactor";
import {
  GetTasksConfigurationInteractor,
  GetTasksConfigurationRepo,
} from "@/features/tasks/get/get-tasks-configuration.interactor";
import { CountUserTasksInteractor, CountTasksRepo } from "@/features/tasks/count-user-tasks.interactor";
import { CountSystemTasksInteractor, CountSystemTasksRepo } from "@/features/tasks/count-system-tasks.interactor";
import { CreateTaskInteractor } from "@/features/tasks/upsert/create-task.interactor";
import { CreateTaskRepo } from "@/features/tasks/upsert/create-task.repo";
import { CreateManyTasksInteractor } from "@/features/tasks/upsert/create-many-tasks.interactor";
import { UpdateTaskInteractor } from "@/features/tasks/upsert/update-task.interactor";
import { UpdateTaskRepo } from "@/features/tasks/upsert/update-task.repo";
import { UpdateManyTasksInteractor } from "@/features/tasks/upsert/update-many-tasks.interactor";
import { DeleteTaskInteractor } from "@/features/tasks/delete/delete-task.interactor";
import { DeleteTaskRepo } from "@/features/tasks/delete/delete-task.repo";
import { DeleteManyTasksInteractor } from "@/features/tasks/delete/delete-many-tasks.interactor";
import {
  GetTaskByIdInteractor,
  GetTaskByIdRepo,
  TaskCustomColumnRepo,
} from "@/features/tasks/get/get-task-by-id.interactor";
import { GetTaskByTypeInteractor, GetTaskByTypeRepo } from "@/features/tasks/get/get-task-by-type.interactor";
import { GetContactsInteractor, GetContactsRepo } from "@/features/contacts/get/get-contacts.interactor";
import { GetContactsApiInteractor } from "@/features/contacts/get/get-contacts-api.interactor";
import {
  GetContactsConfigurationInteractor,
  GetContactsConfigurationRepo,
} from "@/features/contacts/get/get-contacts-configuration.interactor";
import {
  GetContactByIdInteractor,
  GetContactByIdRepo,
  ContactCustomColumnRepo,
} from "@/features/contacts/get/get-contact-by-id.interactor";
import { PrismaContactRepo } from "@/features/contacts/prisma-contact.repository";
import { ValidateQueryParamsValidator } from "@/core/base/validate-query-params.validator";
import { CreateContactInteractor } from "@/features/contacts/upsert/create-contact.interactor";
import { UpdateContactInteractor } from "@/features/contacts/upsert/update-contact.interactor";
import { DeleteContactInteractor } from "@/features/contacts/delete/delete-contact.interactor";
import { CreateContactRepo } from "@/features/contacts/upsert/create-contact.repo";
import { UpdateContactRepo } from "@/features/contacts/upsert/update-contact.repo";
import { DeleteContactRepo } from "@/features/contacts/delete/delete-contact.repo";
import { CreateManyContactsInteractor } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { UpdateManyContactsInteractor } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { DeleteManyContactsInteractor } from "@/features/contacts/delete/delete-many-contacts.interactor";
import {
  GetOrganizationsInteractor,
  GetOrganizationsRepo,
} from "@/features/organizations/get/get-organizations.interactor";
import { GetOrganizationsApiInteractor } from "@/features/organizations/get/get-organizations-api.interactor";
import {
  GetOrganizationsConfigurationInteractor,
  GetOrganizationsConfigurationRepo,
} from "@/features/organizations/get/get-organizations-configuration.interactor";
import {
  GetOrganizationByIdInteractor,
  GetOrganizationByIdRepo,
  OrganizationCustomColumnRepo,
} from "@/features/organizations/get/get-organization-by-id.interactor";
import { CreateOrganizationInteractor } from "@/features/organizations/upsert/create-organization.interactor";
import { CreateOrganizationRepo } from "@/features/organizations/upsert/create-organization.repo";
import { CreateManyOrganizationsInteractor } from "@/features/organizations/upsert/create-many-organizations.interactor";
import { UpdateOrganizationInteractor } from "@/features/organizations/upsert/update-organization.interactor";
import { UpdateOrganizationRepo } from "@/features/organizations/upsert/update-organization.repo";
import { UpdateManyOrganizationsInteractor } from "@/features/organizations/upsert/update-many-organizations.interactor";
import { DeleteOrganizationInteractor } from "@/features/organizations/delete/delete-organization.interactor";
import { DeleteOrganizationRepo } from "@/features/organizations/delete/delete-organization.repo";
import { DeleteManyOrganizationsInteractor } from "@/features/organizations/delete/delete-many-organizations.interactor";
import { PrismaOrganizationRepo } from "@/features/organizations/prisma-organization.repository";
import {
  DeleteCustomColumnInteractor,
  DeleteCustomColumnRepo,
} from "@/features/custom-column/delete-custom-column.interactor";
import { PrismaCustomColumnRepo } from "@/features/custom-column/prisma-custom-column.repository";
import { FindCustomColumnRepo } from "@/core/validation/validate-custom-field-values";
import { FindOrganizationsByIdsRepo } from "@/core/validation/validate-organization-ids";
import { FindUsersByIdsRepo } from "@/core/validation/validate-user-ids";
import { FindDealsByIdsRepo } from "@/core/validation/validate-deal-ids";
import { FindServicesByIdsRepo } from "@/core/validation/validate-service-ids";
import { FindContactsByIdsRepo } from "@/features/contacts/validate-contact-ids";
import { FindTasksByIdsRepo } from "@/core/validation/validate-task-ids";
import {
  GetCustomColumnsInteractor,
  GetCustomColumnsRepo,
} from "@/features/custom-column/get-custom-columns.interactor";
import {
  GetCustomColumnsByEntityTypeInteractor,
  GetCustomColumnsByEntityTypeRepo,
} from "@/features/custom-column/get-custom-columns-by-entity-type.interactor";
import {
  UpsertCustomColumnInteractor,
  UpsertCustomColumnRepo,
} from "@/features/custom-column/upsert-custom-column.interactor";
import { PrismaDealRepo } from "@/features/deals/prisma-deal.repository";
import { GetDealsInteractor, GetDealsRepo } from "@/features/deals/get/get-deals.interactor";
import { GetDealsApiInteractor } from "@/features/deals/get/get-deals-api.interactor";
import {
  GetDealsConfigurationInteractor,
  GetDealsConfigurationRepo,
} from "@/features/deals/get/get-deals-configuration.interactor";
import {
  GetDealByIdInteractor,
  GetDealByIdRepo,
  DealCustomColumnRepo,
} from "@/features/deals/get/get-deal-by-id.interactor";
import { CreateDealInteractor } from "@/features/deals/upsert/create-deal.interactor";
import { CreateDealRepo } from "@/features/deals/upsert/create-deal.repo";
import { CreateManyDealsInteractor } from "@/features/deals/upsert/create-many-deals.interactor";
import { UpdateDealInteractor } from "@/features/deals/upsert/update-deal.interactor";
import { UpdateDealRepo } from "@/features/deals/upsert/update-deal.repo";
import { UpdateManyDealsInteractor } from "@/features/deals/upsert/update-many-deals.interactor";
import { DeleteDealInteractor } from "@/features/deals/delete/delete-deal.interactor";
import { DeleteDealRepo } from "@/features/deals/delete/delete-deal.repo";
import { DeleteManyDealsInteractor } from "@/features/deals/delete/delete-many-deals.interactor";
import { PrismaServiceRepo } from "@/features/services/prisma-service.repository";
import { GetServicesInteractor, GetServicesRepo } from "@/features/services/get/get-services.interactor";
import { GetServicesApiInteractor } from "@/features/services/get/get-services-api.interactor";
import {
  GetServicesConfigurationInteractor,
  GetServicesConfigurationRepo,
} from "@/features/services/get/get-services-configuration.interactor";
import {
  GetServiceByIdInteractor,
  GetServiceByIdRepo,
  ServiceCustomColumnRepo,
} from "@/features/services/get/get-service-by-id.interactor";
import { CreateServiceInteractor } from "@/features/services/upsert/create-service.interactor";
import { CreateServiceRepo } from "@/features/services/upsert/create-service.repo";
import { CreateManyServicesInteractor } from "@/features/services/upsert/create-many-services.interactor";
import { UpdateServiceInteractor } from "@/features/services/upsert/update-service.interactor";
import { UpdateServiceRepo } from "@/features/services/upsert/update-service.repo";
import { UpdateManyServicesInteractor } from "@/features/services/upsert/update-many-services.interactor";
import { DeleteServiceInteractor } from "@/features/services/delete/delete-service.interactor";
import { DeleteServiceRepo } from "@/features/services/delete/delete-service.repo";
import { DeleteManyServicesInteractor } from "@/features/services/delete/delete-many-services.interactor";
import { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import { PrismaWidgetRepo } from "@/features/widget/prisma-widget.repository";
import { GetWidgetsInteractor, GetWidgetsRepo } from "@/features/widget/get-widgets.interactor";
import { UpsertWidgetInteractor, UpsertWidgetRepo } from "@/features/widget/upsert-widget.interactor";
import { DeleteWidgetInteractor, DeleteWidgetRepo } from "@/features/widget/delete-widget.interactor";
import { GetCompanyWidgetsInteractor, GetCompanyWidgetsRepo } from "@/features/widget/get-company-widgets.interactor";
import { GetWidgetByIdInteractor, GetWidgetByIdRepo } from "@/features/widget/get-widget-by-id.interactor";
import {
  UpdateWidgetLayoutsInteractor,
  UpdateWidgetLayoutsRepo,
} from "@/features/widget/update-widget-layouts.interactor";
import {
  GetWidgetFilterableFieldsContactRepo,
  GetWidgetFilterableFieldsDealRepo,
  GetWidgetFilterableFieldsInteractor,
  GetWidgetFilterableFieldsOrganizationRepo,
  GetWidgetFilterableFieldsServiceRepo,
  GetWidgetFilterableFieldsTaskRepo,
} from "@/features/widget/get-widget-filterable-fields.interactor";
import { PrismaWidgetCalculatorRepo } from "@/features/widget/calculator/prisma-widget-calculator.repository";
import { WidgetDataFetcher } from "@/features/widget/calculator/widget-data-fetcher.service";
import { WidgetGroupingService } from "@/features/widget/calculator/widget-grouping.service";
import { UpsertP13nInteractor, UpsertP13nRepo } from "@/features/p13n/upsert-p13n.interactor";
import { UpsertFilterPresetInteractor, UpsertFilterPresetRepo } from "@/features/p13n/upsert-filter-preset.interactor";
import { DeleteFilterPresetInteractor, DeleteFilterPresetRepo } from "@/features/p13n/delete-filter-preset.interactor";
import { SignInWithEmailInteractor } from "@/features/auth/sign-in-with-email.interactor";
import { SignUpWithEmailInteractor } from "@/features/auth/sign-up-with-email.interactor";
import { RequestPasswordResetInteractor } from "@/features/auth/request-password-reset.interactor";
import { SignOutInteractor } from "@/features/auth/sign-out.interactor";
import { ContinueWithSocialsInteractor } from "@/features/auth/continue-with-socials.interactor";
import { FindUserRepo, UserService } from "@/features/user/user.service";
import { GetUserByIdInteractor, GetUserByIdRepo } from "@/features/user/get/get-user-by-id.interactor";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { EventService } from "@/features/event/event.service";
import { WidgetService, RecalculateUserWidgetsRepo } from "@/features/widget/widget.service";
import { GetWebhooksInteractor, GetWebhooksRepo } from "@/features/webhook/get-webhooks.interactor";
import { UpsertWebhookInteractor, UpsertWebhookRepo } from "@/features/webhook/upsert-webhook.interactor";
import { DeleteWebhookInteractor, DeleteWebhookRepo } from "@/features/webhook/delete-webhook.interactor";
import { PrismaWebhookRepo } from "@/features/webhook/prisma-webhook.repository";
import { ProcessWebhookDeliveriesInteractor } from "@/features/webhook/process-webhook-deliveries.interactor";
import { CreateAuditLogRepo, GetWebhooksForEventRepo } from "@/features/event/event.service";
import { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import {
  GetWebhookDeliveriesInteractor,
  GetWebhookDeliveriesRepo,
} from "@/features/webhook/get-webhook-deliveries.interactor";
import { PrismaWebhookDeliveryRepo } from "@/features/webhook/prisma-webhook-delivery.repository";
import {
  ResendWebhookDeliveryInteractor,
  GetWebhookDeliveryByIdRepo,
} from "@/features/webhook/resend-webhook-delivery.interactor";
import {
  ClaimPendingDeliveriesRepo,
  UpdateDeliveryOutcomeRepo,
  GetWebhookSecretRepo,
} from "@/features/webhook/process-webhook-deliveries.interactor";
import { ResetPasswordInteractor } from "@/features/auth/reset-password.interactor";
import { EmailService } from "@/features/email/email.service";
import { GlobalSearchInteractor, GlobalSearchRepo } from "@/features/search/global-search.interactor";
import { PrismaGlobalSearchRepo } from "@/features/search/prisma-global-search.repository";
import { SubscriptionService, SubscriptionRepo } from "@/ee/subscription/subscription.service";
import {
  CreateCheckoutSessionInteractor,
  CreateCheckoutCompanyRepo,
} from "@/ee/subscription/create-checkout-session.interactor";
import { GetSubscriptionInteractor, GetSubscriptionRepo } from "@/ee/subscription/get-subscription.interactor";
import {
  RefreshSubscriptionInteractor,
  RefreshSubscriptionRepo,
} from "@/ee/subscription/refresh-subscription.interactor";
import { CheckAgentHealthInteractor, CheckAgentHealthRepo } from "@/ee/agent/check-agent-health.interactor";
import { GetAgentControlUrlInteractor, GetAgentControlUrlRepo } from "@/ee/agent/get-agent-control-url.interactor";
import { GetAgentProvisionedInteractor, GetAgentProvisionedRepo } from "@/ee/agent/get-agent-provisioned.interactor";
import { ResetAgentInteractor, ResetAgentRepo } from "@/ee/agent/reset-agent.interactor";
import { ProvisionAgentInteractor, ProvisionAgentRepo } from "@/ee/agent/provision-agent.interactor";
import { VerifyAgentMachineInteractor, VerifyAgentMachineRepo } from "@/ee/agent/verify-agent-machine.interactor";
import { AgentMachineService } from "@/ee/agent/agent-machine.service";
import { DeleteApiKeyRepo } from "@/features/api-key/delete-api-key.interactor";
import { GetApiKeysRepo } from "@/features/api-key/get-api-keys.interactor";
import {
  SetAgentEnvironmentVariableInteractor,
  SetAgentEnvironmentVariableRepo,
} from "@/ee/agent/set-agent-environment-variable.interactor";

const di = new Container();

di.bind(FindUserRepo).to(PrismaUserRepo);
di.bind(GetUserByIdRepo).to(PrismaUserRepo);
di.bind(RegisterUserRepo).to(PrismaUserRepo);
di.bind(P13nRepo).to(PrismaP13nRepo);
di.bind(UpsertP13nRepo).to(PrismaP13nRepo);
di.bind(UpsertFilterPresetRepo).to(PrismaP13nRepo);
di.bind(DeleteFilterPresetRepo).to(PrismaP13nRepo);
di.bind(PrismaP13nRepo).toSelf().inSingletonScope();
di.bind(UpsertP13nInteractor).toSelf().inSingletonScope();
di.bind(UpsertFilterPresetInteractor).toSelf().inSingletonScope();
di.bind(DeleteFilterPresetInteractor).toSelf().inSingletonScope();
di.bind(UpdateUserDetailsRepo).to(PrismaUserRepo);
di.bind(UpdateUserSettingsRepo).to(PrismaUserRepo);
di.bind(AdminUpdateUserDetailsRepo).to(PrismaUserRepo);
di.bind(UpdateUserRoleRepo).to(PrismaRoleRepo);
di.bind(AdminUpdateUserSubscriptionRepo).to(PrismaCompanyRepo);
di.bind(PrismaUserRepo).toSelf().inSingletonScope();

di.bind(EmailService).toSelf().inSingletonScope();
di.bind(AuthService).toSelf().inSingletonScope();
di.bind(UserService).toSelf().inSingletonScope();
di.bind(RouteGuardService).toSelf().inSingletonScope();
di.bind(WidgetService).toSelf().inSingletonScope();
di.bind(RecalculateUserWidgetsRepo).to(PrismaWidgetRepo);

di.bind(TaskWorkerRepo).to(PrismaTaskRepo);
di.bind(GetTasksRepo).to(PrismaTaskRepo);
di.bind(GetTasksConfigurationRepo).to(PrismaTaskRepo);
di.bind(CountTasksRepo).to(PrismaTaskRepo);
di.bind(CountSystemTasksRepo).to(PrismaTaskRepo);
di.bind(CreateTaskRepo).to(PrismaTaskRepo);
di.bind(UpdateTaskRepo).to(PrismaTaskRepo);
di.bind(DeleteTaskRepo).to(PrismaTaskRepo);
di.bind(GetTaskByIdRepo).to(PrismaTaskRepo);
di.bind(TaskCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(GetTaskByTypeRepo).to(PrismaTaskRepo);
di.bind(GetWidgetFilterableFieldsTaskRepo).to(PrismaTaskRepo);
di.bind(TaskService).toSelf().inSingletonScope();
di.bind(PrismaTaskRepo).toSelf().inSingletonScope();

di.bind(RegisterUserInteractor).toSelf().inSingletonScope();
di.bind(UpdateUserDetailsInteractor).toSelf().inSingletonScope();
di.bind(UpdateUserSettingsInteractor).toSelf().inSingletonScope();
di.bind(GetUserDetailsInteractor).toSelf().inSingletonScope();
di.bind(GetUserByIdInteractor).toSelf().inSingletonScope();
di.bind(AdminUpdateUserDetailsInteractor).toSelf().inSingletonScope();
di.bind(CreateApiKeyInteractor).toSelf().inSingletonScope();
di.bind(GetApiKeysInteractor).toSelf().inSingletonScope();
di.bind(DeleteApiKeyInteractor).toSelf().inSingletonScope();

di.bind(InviteTokenValidationInteractor).toSelf().inSingletonScope();
di.bind(SignInWithEmailInteractor).toSelf().inSingletonScope();
di.bind(SignUpWithEmailInteractor).toSelf().inSingletonScope();
di.bind(RequestPasswordResetInteractor).toSelf().inSingletonScope();
di.bind(ResetPasswordInteractor).toSelf().inSingletonScope();
di.bind(ContinueWithSocialsInteractor).toSelf().inSingletonScope();
di.bind(SignOutInteractor).toSelf().inSingletonScope();

di.bind(GetUsersRepo).to(PrismaCompanyRepo);
di.bind(UpdateCompanyDetailsRepo).to(PrismaCompanyRepo);
di.bind(GetCompanyDetailsRepo).to(PrismaCompanyRepo);
di.bind(GetOrCreateInviteTokenRepo).to(PrismaCompanyRepo);
di.bind(InviteTokenRepo).to(PrismaCompanyRepo);
di.bind(PrismaCompanyRepo).toSelf().inSingletonScope();

di.bind(UpsertRoleRepo).to(PrismaRoleRepo);
di.bind(GetRolesRepo).to(PrismaRoleRepo);
di.bind(DeleteRoleRepo).to(PrismaRoleRepo);
di.bind(PrismaRoleRepo).toSelf().inSingletonScope();

di.bind(GetCompanyDetailsInteractor).toSelf().inSingletonScope();
di.bind(UpdateCompanyDetailsInteractor).toSelf().inSingletonScope();
di.bind(SendFeedbackInteractor).toSelf().inSingletonScope();
di.bind(GetUsersInteractor).toSelf().inSingletonScope();
di.bind(GetUsersApiInteractor).toSelf().inSingletonScope();
di.bind(GetOrCreateInviteTokenInteractor).toSelf().inSingletonScope();
di.bind(UpsertRoleInteractor).toSelf().inSingletonScope();
di.bind(GetRolesInteractor).toSelf().inSingletonScope();
di.bind(DeleteRoleInteractor).toSelf().inSingletonScope();
di.bind(GetTasksInteractor).toSelf().inSingletonScope();
di.bind(GetTasksApiInteractor).toSelf().inSingletonScope();
di.bind(GetTasksConfigurationInteractor).toSelf().inSingletonScope();
di.bind(CountUserTasksInteractor).toSelf().inSingletonScope();
di.bind(CountSystemTasksInteractor).toSelf().inSingletonScope();
di.bind(CreateTaskInteractor).toSelf().inSingletonScope();
di.bind(UpdateTaskInteractor).toSelf().inSingletonScope();
di.bind(DeleteTaskInteractor).toSelf().inSingletonScope();
di.bind(CreateManyTasksInteractor).toSelf().inSingletonScope();
di.bind(UpdateManyTasksInteractor).toSelf().inSingletonScope();
di.bind(DeleteManyTasksInteractor).toSelf().inSingletonScope();
di.bind(GetTaskByIdInteractor).toSelf().inSingletonScope();
di.bind(GetTaskByTypeInteractor).toSelf().inSingletonScope();

di.bind(CompanyOnboardingTaskListener).toSelf().inSingletonScope();
di.bind(UserPendingAuthorizationTaskListener).toSelf().inSingletonScope();

di.bind(BaseTaskListener).to(CompanyOnboardingTaskListener);
di.bind(BaseTaskListener).to(UserPendingAuthorizationTaskListener);

di.bind(EventService).toSelf().inSingletonScope();

di.bind(PrismaAuditLogRepo).toSelf().inSingletonScope();
di.bind(CreateAuditLogRepo).to(PrismaAuditLogRepo);
di.bind(GetAuditLogsByEntityIdRepo).to(PrismaAuditLogRepo);
di.bind(GetAuditLogsByEntityIdInteractor).toSelf().inSingletonScope();
di.bind(GetAuditLogsRepo).to(PrismaAuditLogRepo);
di.bind(GetAuditLogsInteractor).toSelf().inSingletonScope();
di.bind(GetEntityChangeHistoryByIdAuditLogRepo).to(PrismaAuditLogRepo);
di.bind(GetEntityChangeHistoryByIdCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(GetEntityChangeHistoryByIdInteractor).toSelf().inSingletonScope();
di.bind(GetWebhooksForEventRepo).to(PrismaWebhookRepo);
di.bind(CreateWebhookDeliveryRepo).to(PrismaWebhookDeliveryRepo);
di.bind(GetWebhooksRepo).to(PrismaWebhookRepo);
di.bind(UpsertWebhookRepo).to(PrismaWebhookRepo);
di.bind(DeleteWebhookRepo).to(PrismaWebhookRepo);
di.bind(GetWebhookDeliveriesRepo).to(PrismaWebhookDeliveryRepo);
di.bind(GetWebhookDeliveryByIdRepo).to(PrismaWebhookDeliveryRepo);
di.bind(ClaimPendingDeliveriesRepo).to(PrismaWebhookDeliveryRepo);
di.bind(UpdateDeliveryOutcomeRepo).to(PrismaWebhookDeliveryRepo);
di.bind(GetWebhookSecretRepo).to(PrismaWebhookRepo);
di.bind(PrismaWebhookRepo).toSelf().inSingletonScope();
di.bind(PrismaWebhookDeliveryRepo).toSelf().inSingletonScope();
di.bind(ProcessWebhookDeliveriesInteractor).toSelf().inSingletonScope();
di.bind(GetWebhooksInteractor).toSelf().inSingletonScope();
di.bind(UpsertWebhookInteractor).toSelf().inSingletonScope();
di.bind(DeleteWebhookInteractor).toSelf().inSingletonScope();
di.bind(GetWebhookDeliveriesInteractor).toSelf().inSingletonScope();
di.bind(ResendWebhookDeliveryInteractor).toSelf().inSingletonScope();

di.bind(GetWidgetFilterableFieldsContactRepo).to(PrismaContactRepo);
di.bind(GetContactsRepo).to(PrismaContactRepo);
di.bind(ValidateQueryParamsValidator).toSelf().inSingletonScope();
di.bind(GetContactByIdRepo).to(PrismaContactRepo);
di.bind(ContactCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(CreateContactRepo).to(PrismaContactRepo);
di.bind(UpdateContactRepo).to(PrismaContactRepo);
di.bind(DeleteContactRepo).to(PrismaContactRepo);
di.bind(PrismaContactRepo).toSelf().inSingletonScope();
di.bind(GetContactsInteractor).toSelf().inSingletonScope();
di.bind(GetContactsApiInteractor).toSelf().inSingletonScope();
di.bind(GetContactsConfigurationRepo).to(PrismaContactRepo);
di.bind(GetContactsConfigurationInteractor).toSelf().inSingletonScope();
di.bind(GetContactByIdInteractor).toSelf().inSingletonScope();
di.bind(CreateContactInteractor).toSelf().inSingletonScope();
di.bind(UpdateContactInteractor).toSelf().inSingletonScope();
di.bind(DeleteContactInteractor).toSelf().inSingletonScope();
di.bind(CreateManyContactsInteractor).toSelf().inSingletonScope();
di.bind(UpdateManyContactsInteractor).toSelf().inSingletonScope();
di.bind(DeleteManyContactsInteractor).toSelf().inSingletonScope();
di.bind(CreateManyOrganizationsInteractor).toSelf().inSingletonScope();
di.bind(UpdateManyOrganizationsInteractor).toSelf().inSingletonScope();
di.bind(DeleteManyOrganizationsInteractor).toSelf().inSingletonScope();

di.bind(GetWidgetFilterableFieldsOrganizationRepo).to(PrismaOrganizationRepo);
di.bind(GetOrganizationsRepo).to(PrismaOrganizationRepo);
di.bind(GetOrganizationsConfigurationRepo).to(PrismaOrganizationRepo);
di.bind(GetOrganizationByIdRepo).to(PrismaOrganizationRepo);
di.bind(OrganizationCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(CreateOrganizationRepo).to(PrismaOrganizationRepo);
di.bind(UpdateOrganizationRepo).to(PrismaOrganizationRepo);
di.bind(DeleteOrganizationRepo).to(PrismaOrganizationRepo);
di.bind(PrismaOrganizationRepo).toSelf().inSingletonScope();
di.bind(GetOrganizationsInteractor).toSelf().inSingletonScope();
di.bind(GetOrganizationsApiInteractor).toSelf().inSingletonScope();
di.bind(GetOrganizationsConfigurationInteractor).toSelf().inSingletonScope();
di.bind(GetOrganizationByIdInteractor).toSelf().inSingletonScope();
di.bind(CreateOrganizationInteractor).toSelf().inSingletonScope();
di.bind(UpdateOrganizationInteractor).toSelf().inSingletonScope();
di.bind(DeleteOrganizationInteractor).toSelf().inSingletonScope();

di.bind(DeleteCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(UpsertCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(FindCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(FindOrganizationsByIdsRepo).to(PrismaOrganizationRepo);
di.bind(FindUsersByIdsRepo).to(PrismaCompanyRepo);
di.bind(FindDealsByIdsRepo).to(PrismaDealRepo);
di.bind(FindServicesByIdsRepo).to(PrismaServiceRepo);
di.bind(FindTasksByIdsRepo).to(PrismaTaskRepo);
di.bind(FindContactsByIdsRepo).to(PrismaContactRepo);
di.bind(GetUnscopedContactRepo).to(PrismaContactRepo);
di.bind(GetUnscopedOrganizationRepo).to(PrismaOrganizationRepo);
di.bind(GetUnscopedDealRepo).to(PrismaDealRepo);
di.bind(GetUnscopedServiceRepo).to(PrismaServiceRepo);
di.bind(PrismaCustomColumnRepo).toSelf().inSingletonScope();
di.bind(DeleteCustomColumnInteractor).toSelf().inSingletonScope();
di.bind(UpsertCustomColumnInteractor).toSelf().inSingletonScope();

di.bind(GetCustomColumnsRepo).to(PrismaCustomColumnRepo);
di.bind(GetCustomColumnsByEntityTypeRepo).to(PrismaCustomColumnRepo);
di.bind(GetCustomColumnsInteractor).toSelf().inSingletonScope();
di.bind(GetCustomColumnsByEntityTypeInteractor).toSelf().inSingletonScope();

di.bind(CreateDealRepo).to(PrismaDealRepo);
di.bind(UpdateDealRepo).to(PrismaDealRepo);
di.bind(GetDealsRepo).to(PrismaDealRepo);
di.bind(GetDealsConfigurationRepo).to(PrismaDealRepo);
di.bind(GetDealByIdRepo).to(PrismaDealRepo);
di.bind(DealCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(DeleteDealRepo).to(PrismaDealRepo);
di.bind(GetWidgetFilterableFieldsDealRepo).to(PrismaDealRepo);
di.bind(PrismaDealRepo).toSelf().inSingletonScope();
di.bind(GetDealsInteractor).toSelf().inSingletonScope();
di.bind(GetDealsApiInteractor).toSelf().inSingletonScope();
di.bind(GetDealsConfigurationInteractor).toSelf().inSingletonScope();
di.bind(GetDealByIdInteractor).toSelf().inSingletonScope();
di.bind(CreateDealInteractor).toSelf().inSingletonScope();
di.bind(UpdateDealInteractor).toSelf().inSingletonScope();
di.bind(DeleteDealInteractor).toSelf().inSingletonScope();
di.bind(CreateManyDealsInteractor).toSelf().inSingletonScope();
di.bind(UpdateManyDealsInteractor).toSelf().inSingletonScope();
di.bind(DeleteManyDealsInteractor).toSelf().inSingletonScope();

di.bind(CreateServiceRepo).to(PrismaServiceRepo);
di.bind(UpdateServiceRepo).to(PrismaServiceRepo);
di.bind(GetServicesRepo).to(PrismaServiceRepo);
di.bind(GetServicesConfigurationRepo).to(PrismaServiceRepo);
di.bind(GetServiceByIdRepo).to(PrismaServiceRepo);
di.bind(ServiceCustomColumnRepo).to(PrismaCustomColumnRepo);
di.bind(DeleteServiceRepo).to(PrismaServiceRepo);
di.bind(GetWidgetFilterableFieldsServiceRepo).to(PrismaServiceRepo);
di.bind(PrismaServiceRepo).toSelf().inSingletonScope();
di.bind(GetServicesInteractor).toSelf().inSingletonScope();
di.bind(GetServicesApiInteractor).toSelf().inSingletonScope();
di.bind(GetServicesConfigurationInteractor).toSelf().inSingletonScope();
di.bind(GetServiceByIdInteractor).toSelf().inSingletonScope();
di.bind(CreateServiceInteractor).toSelf().inSingletonScope();
di.bind(UpdateServiceInteractor).toSelf().inSingletonScope();
di.bind(DeleteServiceInteractor).toSelf().inSingletonScope();
di.bind(CreateManyServicesInteractor).toSelf().inSingletonScope();
di.bind(UpdateManyServicesInteractor).toSelf().inSingletonScope();
di.bind(DeleteManyServicesInteractor).toSelf().inSingletonScope();

di.bind(GlobalSearchRepo).to(PrismaGlobalSearchRepo);
di.bind(PrismaGlobalSearchRepo).toSelf().inSingletonScope();
di.bind(GlobalSearchInteractor).toSelf().inSingletonScope();

di.bind(SubscriptionRepo).to(PrismaCompanyRepo);
di.bind(SubscriptionService).toSelf().inSingletonScope();
di.bind(CreateCheckoutSessionInteractor).toSelf().inSingletonScope();
di.bind(GetSubscriptionRepo).to(PrismaCompanyRepo);
di.bind(RefreshSubscriptionRepo).to(PrismaCompanyRepo);
di.bind(CreateCheckoutCompanyRepo).to(PrismaCompanyRepo);
di.bind(GetSubscriptionInteractor).toSelf().inSingletonScope();
di.bind(RefreshSubscriptionInteractor).toSelf().inSingletonScope();

di.bind(ResetAgentRepo).to(PrismaUserRepo);
di.bind(ProvisionAgentRepo).to(PrismaUserRepo);
di.bind(CheckAgentHealthRepo).to(PrismaUserRepo);
di.bind(GetAgentControlUrlRepo).to(PrismaUserRepo);
di.bind(GetAgentProvisionedRepo).to(PrismaUserRepo);
di.bind(SetAgentEnvironmentVariableRepo).to(PrismaUserRepo);
di.bind(VerifyAgentMachineRepo).to(PrismaUserRepo);
di.bind(DeleteApiKeyRepo).to(PrismaUserRepo);
di.bind(GetApiKeysRepo).to(PrismaUserRepo);
di.bind(AgentMachineService).toSelf().inSingletonScope();
di.bind(CheckAgentHealthInteractor).toSelf().inSingletonScope();
di.bind(GetAgentControlUrlInteractor).toSelf().inSingletonScope();
di.bind(GetAgentProvisionedInteractor).toSelf().inSingletonScope();
di.bind(ResetAgentInteractor).toSelf().inSingletonScope();
di.bind(ProvisionAgentInteractor).toSelf().inSingletonScope();
di.bind(SetAgentEnvironmentVariableInteractor).toSelf().inSingletonScope();
di.bind(VerifyAgentMachineInteractor).toSelf().inSingletonScope();
di.bind(GetWidgetsRepo).to(PrismaWidgetRepo);
di.bind(UpsertWidgetRepo).to(PrismaWidgetRepo);
di.bind(DeleteWidgetRepo).to(PrismaWidgetRepo);
di.bind(UpdateWidgetLayoutsRepo).to(PrismaWidgetRepo);
di.bind(GetCompanyWidgetsRepo).to(PrismaWidgetRepo);
di.bind(GetWidgetByIdRepo).to(PrismaWidgetRepo);
di.bind(WidgetDataFetcher).toSelf().inSingletonScope();
di.bind(WidgetGroupingService).toSelf().inSingletonScope();
di.bind(PrismaWidgetRepo).toSelf().inSingletonScope();
di.bind(PrismaWidgetCalculatorRepo).toSelf().inSingletonScope();
di.bind(GetWidgetsInteractor).toSelf().inSingletonScope();
di.bind(UpsertWidgetInteractor).toSelf().inSingletonScope();
di.bind(DeleteWidgetInteractor).toSelf().inSingletonScope();
di.bind(UpdateWidgetLayoutsInteractor).toSelf().inSingletonScope();
di.bind(GetCompanyWidgetsInteractor).toSelf().inSingletonScope();
di.bind(GetWidgetByIdInteractor).toSelf().inSingletonScope();
di.bind(GetWidgetFilterableFieldsInteractor).toSelf().inSingletonScope();

di.bind(CleanupInactiveUsersResourcesActionRepo).to(PrismaUserRepo);
di.bind(CleanupNonProCompaniesResourcesRepo).to(PrismaUserRepo);
di.bind(StopInactiveUsersMachinesRepo).to(PrismaUserRepo);
di.bind(SendWelcomeAndDemoActionRepo).to(PrismaUserRepo);
di.bind(SendTrialExtensionOfferActionRepo).to(PrismaUserRepo);
di.bind(SendTrialInactivationReminderActionRepo).to(PrismaUserRepo);
di.bind(DeactivateTrialUsersAndSendNoticeRepo).to(PrismaUserRepo);
di.bind(DeactivateUsersAfterSubscriptionGracePeriodRepo).to(PrismaUserRepo);
di.bind(CleanupInactiveUsersResourcesInteractor).toSelf().inSingletonScope();
di.bind(CleanupNonProCompaniesResourcesInteractor).toSelf().inSingletonScope();
di.bind(StopInactiveUsersMachinesInteractor).toSelf().inSingletonScope();
di.bind(SendWelcomeAndDemoInteractor).toSelf().inSingletonScope();
di.bind(SendTrialExtensionOfferInteractor).toSelf().inSingletonScope();
di.bind(SendTrialInactivationReminderInteractor).toSelf().inSingletonScope();
di.bind(DeactivateTrialUsersAndSendNoticeInteractor).toSelf().inSingletonScope();
di.bind(DeactivateUsersAfterSubscriptionGracePeriodInteractor).toSelf().inSingletonScope();

export { di };
