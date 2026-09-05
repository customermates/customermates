import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import {
  AggregationType,
  ConnectedAccountStatus,
  CustomColumnType,
  MessagingProvider,
  MessagingThreadState,
  Resource,
  Status,
  SubscriptionPlan,
  SubscriptionStatus,
  TaskType,
  Theme,
  WebhookDeliveryStatus,
  WidgetKind,
} from "@/generated/prisma";
import { ACTIVITY_TYPE_VALUES } from "@/app/[locale]/(protected)/dashboard/components/activity-filter-form";
import { socialErrorMessageKeys } from "@/app/[locale]/(public)/auth/social-error-keys";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { IMPORT_ISSUE_CODES } from "@/features/data-transfer/import/import-plan";
import { ALL_LEGAL_DOCUMENTS } from "@/constants/legal-documents";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { AGENT_ACTIVITY_KINDS } from "@/ee/agent-chat/agent-activity";
import { OPERATOR_AUDIT_ACTION } from "@/ee/operator/operator.schema";
import { DomainEvent } from "@/features/event/domain-events";
import { FeedbackType } from "@/features/feedback/send-feedback.schema";
import {
  ENTITY_TERMINOLOGY_PRESETS,
  FILTER_FIELD_TERMINOLOGY,
} from "@/features/entity-terminology/entity-terminology.constants";
import { DIAGRAM_SYSTEM_LABEL_KEYS, DisplayType } from "@/features/widget/widget.schema";
import { ROUTING_LOCALES } from "@/i18n/locale-registry";

const ENTITY_TERMINOLOGY_KEYS = Object.entries(ENTITY_TERMINOLOGY_PRESETS).flatMap(([entityType, presets]) =>
  presets.flatMap((preset) =>
    (["plural", "singular"] as const).map((form) => `EntityTerminology.presets.${entityType}.${preset}.${form}`),
  ),
);

const DOMAIN_EVENT_KEYS = Object.values(DomainEvent).map((event) => `Common.events.${event}`);
const FEEDBACK_DESCRIPTION_KEYS = Object.values(FeedbackType).map((type) => `feedback.${type}.description`);
const FEEDBACK_TITLE_KEYS = Object.values(FeedbackType).map((type) => `feedback.${type}.title`);
const CUSTOM_ERROR_CODE_KEYS = Object.values(CustomErrorCode).map((code) => `Common.errors.${code}`);
const FILTER_FIELD_KEYS = Object.values(FilterFieldKey)
  .filter((field) => !(field in FILTER_FIELD_TERMINOLOGY))
  .map((field) => `Common.filters.fields.${field}`);
const ROLE_RESOURCE_KEYS = Object.values(Resource).map((resource) => `RoleModal.resources.${resource}`);
const DISPLAY_TYPE_KEYS = Object.values(DisplayType).map((displayType) => `Dashboard.displayTypes.${displayType}`);
const WIDGET_KIND_KEYS = Object.values(WidgetKind).map((kind) => `Dashboard.widgetKinds.${kind}`);
const WIDGET_KIND_DESCRIPTION_KEYS = Object.values(WidgetKind).map(
  (kind) => `Dashboard.widgetEditor.kind.${kind}Description`,
);
const activityTypeOptionKeys = (leaf: "description" | "label") =>
  ACTIVITY_TYPE_VALUES.map((value) => `Dashboard.widgetEditor.filters.activityTypeOptions.${value}.${leaf}`);
const DIAGRAM_SYSTEM_KEYS = DIAGRAM_SYSTEM_LABEL_KEYS.map((key) => `Diagrams.${key}`);
const AGGREGATION_TYPE_KEYS = [
  ...Object.values(AggregationType).map((aggregationType) => `Dashboard.aggregationTypes.${aggregationType}`),
  "Dashboard.aggregationTypes.dealValueRelated",
  "Dashboard.aggregationTypes.dealWeightedValueRelated",
] as const;
const DATE_BUCKET_KEYS = [
  "Common.dateBuckets.day",
  "Common.dateBuckets.earlier",
  "Common.dateBuckets.later",
  "Common.dateBuckets.month",
  "Common.dateBuckets.week",
] as const;
const TASK_TYPE_KEYS = Object.values(TaskType).map((type) => `Common.taskTypes.${type}`);
const DATE_PRESET_KEYS = [
  "Common.datePresets.endTime",
  "Common.datePresets.inAMonth",
  "Common.datePresets.inAWeek",
  "Common.datePresets.inAYear",
  "Common.datePresets.next7Days",
  "Common.datePresets.next30Days",
  "Common.datePresets.nextMonth",
  "Common.datePresets.startTime",
  "Common.datePresets.thisMonth",
  "Common.datePresets.today",
] as const;
const DIRECT_COMMON_ERROR_KEYS = ["roleSystemRequired"] as const;
const COMMON_ERROR_KEYS = [
  ...CUSTOM_ERROR_CODE_KEYS,
  ...DIRECT_COMMON_ERROR_KEYS.map((code) => `Common.errors.${code}`),
];
const ENTITLEMENT_DENIAL_KEYS = [
  "ConnectedAccountsCard.agentChatDisabled",
  "ConnectedAccountsCard.agentChatRequiresCloud",
  "ConnectedAccountsCard.agentChatRequiresPlan",
  "ConnectedAccountsCard.messagingRequiresCloud",
  "ConnectedAccountsCard.messagingRequiresPro",
  "ConnectedAccountsCard.paidSubscriptionRequired",
  "ConnectedAccountsCard.sharedAccountsRequiresBusiness",
  "ConnectedAccountsCard.sharedAccountsRequiresCloud",
] as const;
const FORM_FIELD_INPUT_KEYS = [
  "Common.inputs.amount",
  "Common.inputs.avatarUrl",
  "Common.inputs.company",
  "Common.inputs.confirmEmail",
  "Common.inputs.confirmPassword",
  "Common.inputs.country",
  "Common.inputs.currency",
  "Common.inputs.description",
  "Common.inputs.email",
  "Common.inputs.emails",
  "Common.inputs.events",
  "Common.inputs.feedback",
  "Common.inputs.firstName",
  "Common.inputs.lastName",
  "Common.inputs.message",
  "Common.inputs.name",
  "Common.inputs.password",
  "Common.inputs.roleId",
  "Common.inputs.secret",
  "Common.inputs.status",
  "Common.inputs.url",
  "Common.inputs.userIds",
] as const;
const AUDIT_FIELD_KEYS = [
  "AuditLogModal.fields.acceptanceType",
  "AuditLogModal.fields.acceptingEmail",
  "AuditLogModal.fields.changedDocuments",
  "AuditLogModal.fields.city",
  "AuditLogModal.fields.country",
  "AuditLogModal.fields.currency",
  "AuditLogModal.fields.dealStageWeights",
  "AuditLogModal.fields.dealWeightingColumnId",
  "AuditLogModal.fields.effectiveAt",
  "AuditLogModal.fields.emails",
  "AuditLogModal.fields.isNewCompany",
  "AuditLogModal.fields.postalCode",
  "AuditLogModal.fields.recipientEmail",
  "AuditLogModal.fields.street",
  "AuditLogModal.fields.terminology",
  "AuditLogModal.fields.versions",
  "AuditLogModal.fields.visibility",
] as const;

const TABLE_COLUMN_KEYS = [
  "Common.table.columns.actions",
  "Common.table.columns.trialEnd",
  "Common.table.columns.amount",
  "Common.table.columns.weightedValue",
  "Common.table.columns.avatarUrl",
  "Common.table.columns.channels",
  "Common.table.columns.contacts",
  "Common.table.columns.createdAt",
  "Common.table.columns.credits",
  "Common.table.columns.customFieldValues",
  "Common.table.columns.deals",
  "Common.table.columns.description",
  "Common.table.columns.displayName",
  "Common.table.columns.email",
  "Common.table.columns.emailAddress",
  "Common.table.columns.enabled",
  "Common.table.columns.entity",
  "Common.table.columns.entityId",
  "Common.table.columns.entityType",
  "Common.table.columns.event",
  "Common.table.columns.events",
  "Common.table.columns.expiresAt",
  "Common.table.columns.firstName",
  "Common.table.columns.adProvider",
  "Common.table.columns.id",
  "Common.table.columns.identifiers",
  "Common.table.columns.isSystemRole",
  "Common.table.columns.label",
  "Common.table.columns.lastName",
  "Common.table.columns.lastRequest",
  "Common.table.columns.name",
  "Common.table.columns.notes",
  "Common.table.columns.options",
  "Common.table.columns.organizations",
  "Common.table.columns.permissions",
  "Common.table.columns.provider",
  "Common.table.columns.role",
  "Common.table.columns.secret",
  "Common.table.columns.services",
  "Common.table.columns.status",
  "Common.table.columns.statusCode",
  "Common.table.columns.tasks",
  "Common.table.columns.totalQuantity",
  "Common.table.columns.totalValue",
  "Common.table.columns.type",
  "Common.table.columns.updatedAt",
  "Common.table.columns.url",
  "Common.table.columns.user",
  "Common.table.columns.users",
  "Common.table.columns.action",
  "Common.table.columns.actor",
  "Common.table.columns.allowance",
  "Common.table.columns.lastActiveAt",
  "Common.table.columns.members",
  "Common.table.columns.operator",
  "Common.table.columns.owner",
  "Common.table.columns.plan",
  "Common.table.columns.reason",
  "Common.table.columns.source",
  "Common.table.columns.subscription",
  "Common.table.columns.tags",
  "Common.table.columns.target",
  "Common.table.columns.workspace",
] as const;

const PROVIDER_KEYS = Object.values(MessagingProvider).map((provider) => `Common.providers.${provider}`);
const IMPORT_ISSUE_KEYS = IMPORT_ISSUE_CODES.map((code) => `DataTransfer.import.issues.${code}`);
const USER_STATUS_KEYS = Object.values(Status).map((status) => `Common.userStatuses.${status}`);
const LOCALE_KEYS = [...ROUTING_LOCALES, "system"].map((locale) => `Common.locales.${locale}`);
const THEME_KEYS = Object.values(Theme).map((theme) => `Common.themes.${theme}`);
const FILTER_OPERATOR_KEYS = Object.values(FilterOperatorKey).map((operator) => `Common.filters.operators.${operator}`);
const COLOR_KEYS = CHIP_COLORS.map((color) => `Common.colors.${color}`);
const CUSTOM_COLUMN_TYPE_KEYS = Object.values(CustomColumnType).map(
  (columnType) => `Common.customColumnTypes.${columnType}`,
);
const THREAD_STATE_KEYS = Object.values(MessagingThreadState).map((state) => `Inbox.threadStates.${state}`);
const WEBHOOK_DELIVERY_STATUS_KEYS = Object.values(WebhookDeliveryStatus).map(
  (status) => `WebhookDeliveryModal.deliveryStatus.${status}`,
);
const CONNECTED_ACCOUNT_STATUS_KEYS = Object.values(ConnectedAccountStatus).map(
  (status) => `ConnectedAccountsCard.statusLabels.${status}`,
);
const SUBSCRIPTION_PLAN_KEYS = Object.values(SubscriptionPlan).map((plan) => `Subscription.planNames.${plan}`);
const SUBSCRIPTION_STATUS_KEYS = Object.values(SubscriptionStatus).map((status) => `Subscription.status.${status}`);
const SELECTABLE_SUBSCRIPTION_PLANS = Object.values(SubscriptionPlan).filter(
  (plan) => plan !== SubscriptionPlan.enterprise,
);
const SUBSCRIPTION_FEATURE_KEYS = [...loadCatalogPaths().leafPaths].filter((key) =>
  SELECTABLE_SUBSCRIPTION_PLANS.some((plan) => key.startsWith(`Subscription.picker.features.${plan}.`)),
);
const ENTITY_TIMELINE_TYPE_KEYS = [
  "EntityTimeline.types.activities",
  "EntityTimeline.types.changes",
  "EntityTimeline.types.messages",
] as const;
const ERROR_CARD_DYNAMIC_KEYS = [
  "ErrorCard.inactiveUser",
  "ErrorCard.invalidInviteLink",
  "ErrorCard.invalidOnboardingIntent",
  "ErrorCard.inviteLinkExpired",
  "ErrorCard.onboardingSessionExpired",
] as const;
const AUTH_SOCIAL_ERROR_KEYS = socialErrorMessageKeys();
const HOMEPAGE_PRICING_VARIABLE_KEYS = [
  "HomepagePricing.cloud.badge",
  "HomepagePricing.cloud.compareText",
  "HomepagePricing.cloud.featureBusiness",
  "HomepagePricing.cloud.featurePro",
  "HomepagePricing.cloud.featureStarter",
  "HomepagePricing.cloud.period",
  "HomepagePricing.selfHosted.featureApi",
  "HomepagePricing.selfHosted.featureCommunity",
  "HomepagePricing.selfHosted.featureN8n",
  "HomepagePricing.selfHosted.featureRecords",
  "HomepagePricing.selfHosted.featureUsers",
  "HomepagePricing.selfHosted.period",
] as const;
const DEFAULT_DATA_COLUMN_KEYS = [
  "Common.defaultData.contact.columnLabel",
  "Common.defaultData.deal.columnLabel",
  "Common.defaultData.task.columnLabel",
] as const;
const DEFAULT_DATA_OPTION_KEYS = [
  "Common.defaultData.contact.options.contact",
  "Common.defaultData.contact.options.inProgress",
  "Common.defaultData.contact.options.lost",
  "Common.defaultData.contact.options.new",
  "Common.defaultData.contact.options.qualified",
  "Common.defaultData.contact.options.won",
  "Common.defaultData.deal.options.demo",
  "Common.defaultData.deal.options.lost",
  "Common.defaultData.deal.options.negotiation",
  "Common.defaultData.deal.options.proposal",
  "Common.defaultData.deal.options.prospecting",
  "Common.defaultData.deal.options.qualification",
  "Common.defaultData.deal.options.won",
  "Common.defaultData.task.options.archived",
  "Common.defaultData.task.options.blocked",
  "Common.defaultData.task.options.done",
  "Common.defaultData.task.options.inProgress",
  "Common.defaultData.task.options.onHold",
  "Common.defaultData.task.options.open",
] as const;
const ONBOARDING_STEP_TITLE_KEYS = ["profile", "invite", "ai"].map((step) => `OnboardingWizard.steps.${step}.title`);
const ONBOARDING_STEP_SUBTITLE_KEYS = ["profile", "invite", "ai"].map(
  (step) => `OnboardingWizard.steps.${step}.subtitle`,
);
const ONBOARDING_CHOICE_KEYS = [
  "chatgpt",
  "claude",
  "claudeCode",
  "claudeDesktop",
  "codex",
  "cursor",
  "gemini",
  "openai",
  "skip",
].map((choice) => `OnboardingWizard.ai.choices.${choice}`);
const MCP_TOOL_KEYS = ["claudeCode", "claudeDesktop", "codex", "cursor", "gemini"] as const;
const ONBOARDING_INSTALL_KEYS = MCP_TOOL_KEYS.map((tool) => `OnboardingWizard.ai.install.instruction.${tool}`);
const ONBOARDING_METHODS = ["account", "local"] as const;
const onboardingMethodKeys = (field: string) =>
  ONBOARDING_METHODS.map((method) => `OnboardingWizard.ai.methods.${method}.${field}`);
const ONBOARDING_OPENAI_METHODS = ["chatgpt", "codex"] as const;
const onboardingOpenAiMethodKeys = (field: string) =>
  ONBOARDING_OPENAI_METHODS.map((method) => `OnboardingWizard.ai.openai.methods.${method}.${field}`);
const LEGAL_DOCUMENT_KEYS = ALL_LEGAL_DOCUMENTS.map((document) => `LegalDocumentNotice.documents.${document}`);
const AGENT_APPROVAL_RESOLUTION_KEYS = ["approve", "cancelled", "reject", "timeout"].map(
  (resolution) => `AgentChat.approval.${resolution}`,
);
const AGENT_ACTIVITY_RESOURCE_KEYS = [
  "AgentChat.activity.resource.contacts",
  "AgentChat.activity.resource.deals",
  "AgentChat.activity.resource.messages",
  "AgentChat.activity.resource.organizations",
  "AgentChat.activity.resource.services",
  "AgentChat.activity.resource.tasks",
  "AgentChat.activity.resource.terminology",
  "AgentChat.activity.resource.widgets",
];
const AGENT_ACTIVITY_LABEL_KEYS = [
  "AgentChat.activity.label.preview",
  "AgentChat.activity.label.subject",
  "AgentChat.activity.label.to",
];

const AGENT_READ_ONLY_SUGGESTION_KEYS = [
  "AgentChat.suggestions.readOnly.explain",
  "AgentChat.suggestions.readOnly.relationships",
  "AgentChat.suggestions.readOnly.tour",
];

const AGENT_ACTIVITY_RESOURCE_SINGULAR_KEYS = [
  "AgentChat.activity.resourceSingular.contacts",
  "AgentChat.activity.resourceSingular.deals",
  "AgentChat.activity.resourceSingular.messages",
  "AgentChat.activity.resourceSingular.organizations",
  "AgentChat.activity.resourceSingular.services",
  "AgentChat.activity.resourceSingular.tasks",
  "AgentChat.activity.resourceSingular.terminology",
  "AgentChat.activity.resourceSingular.widgets",
];
const AGENT_ACTIVITY_STATE_KEYS = AGENT_ACTIVITY_KINDS.flatMap((kind) =>
  (["done", "error", "running"] as const).map((state) => `AgentChat.activity.state.${kind}.${state}`),
);
const AGENT_SUGGESTION_KEYS = [
  "AgentChat.suggestions.pages.connected-accounts.data.accounts-add-channel",
  "AgentChat.suggestions.pages.connected-accounts.data.accounts-list",
  "AgentChat.suggestions.pages.connected-accounts.data.accounts-sync",
  "AgentChat.suggestions.pages.connected-accounts.empty.accounts-connect-email",
  "AgentChat.suggestions.pages.connected-accounts.empty.accounts-connect-linkedin",
  "AgentChat.suggestions.pages.connected-accounts.empty.accounts-connect-whatsapp",
  "AgentChat.suggestions.pages.contacts.data.contacts-cleanup",
  "AgentChat.suggestions.pages.contacts.data.contacts-summary",
  "AgentChat.suggestions.pages.contacts.data.create-contact",
  "AgentChat.suggestions.pages.contacts.empty.contacts-tour",
  "AgentChat.suggestions.pages.contacts.empty.first-contact",
  "AgentChat.suggestions.pages.contacts.empty.setup-contacts",
  "AgentChat.suggestions.pages.dashboard.data.dashboard-tour",
  "AgentChat.suggestions.pages.dashboard.data.next-actions",
  "AgentChat.suggestions.pages.dashboard.data.summary",
  "AgentChat.suggestions.pages.dashboard.empty.capabilities",
  "AgentChat.suggestions.pages.dashboard.empty.setup",
  "AgentChat.suggestions.pages.dashboard.empty.tour",
  "AgentChat.suggestions.pages.deals.data.create-deal",
  "AgentChat.suggestions.pages.deals.data.pipeline-gaps",
  "AgentChat.suggestions.pages.deals.data.pipeline-summary",
  "AgentChat.suggestions.pages.deals.empty.deals-tour",
  "AgentChat.suggestions.pages.deals.empty.first-deal",
  "AgentChat.suggestions.pages.deals.empty.setup-pipeline",
  "AgentChat.suggestions.pages.default.data.default-contact-count",
  "AgentChat.suggestions.pages.default.data.default-open-deals",
  "AgentChat.suggestions.pages.default.data.default-tour",
  "AgentChat.suggestions.pages.default.empty.default-capabilities",
  "AgentChat.suggestions.pages.default.empty.default-import",
  "AgentChat.suggestions.pages.default.empty.default-setup",
  "AgentChat.suggestions.pages.inbox.data.inbox-add-channel",
  "AgentChat.suggestions.pages.inbox.data.inbox-explain-data",
  "AgentChat.suggestions.pages.inbox.data.inbox-needs-reply",
  "AgentChat.suggestions.pages.inbox.empty.inbox-connect-email",
  "AgentChat.suggestions.pages.inbox.empty.inbox-connect-whatsapp",
  "AgentChat.suggestions.pages.inbox.empty.inbox-explain",
  "AgentChat.suggestions.pages.organizations.data.create-organization",
  "AgentChat.suggestions.pages.organizations.data.organization-gaps",
  "AgentChat.suggestions.pages.organizations.data.organizations-summary",
  "AgentChat.suggestions.pages.organizations.empty.first-organization",
  "AgentChat.suggestions.pages.organizations.empty.organizations-tour",
  "AgentChat.suggestions.pages.organizations.empty.setup-organizations",
  "AgentChat.suggestions.pages.services.data.create-service",
  "AgentChat.suggestions.pages.services.data.service-gaps",
  "AgentChat.suggestions.pages.services.data.services-summary",
  "AgentChat.suggestions.pages.services.empty.first-service",
  "AgentChat.suggestions.pages.services.empty.services-tour",
  "AgentChat.suggestions.pages.services.empty.setup-services",
  "AgentChat.suggestions.pages.tasks.data.create-task",
  "AgentChat.suggestions.pages.tasks.data.task-gaps",
  "AgentChat.suggestions.pages.tasks.data.task-priorities",
  "AgentChat.suggestions.pages.tasks.empty.first-task",
  "AgentChat.suggestions.pages.tasks.empty.setup-tasks",
  "AgentChat.suggestions.pages.tasks.empty.tasks-tour",
];

const AGENT_CREDIT_BLOCKED_KEYS = [
  "configuration_unavailable",
  "credits_exhausted",
  "self_hosted",
  "subscription_unavailable",
].map((reason) => `AgentChat.credits.blocked.${reason}`);

const DYNAMIC_TEMPLATE_CONSUMERS = new Map<string, readonly string[]>([
  ["AuditLogModal.fields.${*}", AUDIT_FIELD_KEYS],
  ["AuthSocialErrors.${*}", AUTH_SOCIAL_ERROR_KEYS],
  ["Common.colors.${*}", COLOR_KEYS],
  ["Common.customColumnTypes.${*}", CUSTOM_COLUMN_TYPE_KEYS],
  ["Common.dateBuckets.${*}", DATE_BUCKET_KEYS],
  ["Common.datePresets.${*}", DATE_PRESET_KEYS],
  ["Common.defaultData.${*}.columnLabel", DEFAULT_DATA_COLUMN_KEYS],
  ["Common.defaultData.${*}.options.${*}", DEFAULT_DATA_OPTION_KEYS],
  ["Common.errors.${*}", CUSTOM_ERROR_CODE_KEYS],
  ["Common.events.${*}", DOMAIN_EVENT_KEYS],
  ["Common.filters.operators.${*}", FILTER_OPERATOR_KEYS],
  ["Common.locales.${*}", LOCALE_KEYS],
  ["LegalDocumentNotice.documents.${*}", LEGAL_DOCUMENT_KEYS],
  ["Common.providers.${*}", PROVIDER_KEYS],
  ["DataTransfer.import.issues.${*}", IMPORT_ISSUE_KEYS],
  ["Common.themes.${*}", THEME_KEYS],
  ["Common.userStatuses.${*}", USER_STATUS_KEYS],
  ["ConnectedAccountsCard.statusLabels.${*}", CONNECTED_ACCOUNT_STATUS_KEYS],
  ["Dashboard.displayTypes.${*}", DISPLAY_TYPE_KEYS],
  ["Dashboard.widgetEditor.filters.activityTypeOptions.${*}.description", activityTypeOptionKeys("description")],
  ["Dashboard.widgetEditor.filters.activityTypeOptions.${*}.label", activityTypeOptionKeys("label")],
  ["Dashboard.widgetEditor.kind.${*}Description", WIDGET_KIND_DESCRIPTION_KEYS],
  ["Dashboard.widgetKinds.${*}", WIDGET_KIND_KEYS],
  ["EntityTimeline.types.${*}", ENTITY_TIMELINE_TYPE_KEYS],
  ["ErrorCard.${*}", ERROR_CARD_DYNAMIC_KEYS],
  ["HomepagePricing.${*}.${*}", HOMEPAGE_PRICING_VARIABLE_KEYS],
  ["HomepagePricing.${*}.ctaText", ["HomepagePricing.cloud.ctaText", "HomepagePricing.selfHosted.ctaText"]],
  ["HomepagePricing.${*}.tag", ["HomepagePricing.cloud.tag", "HomepagePricing.selfHosted.tag"]],
  ["HomepagePricing.${*}.title", ["HomepagePricing.cloud.title", "HomepagePricing.selfHosted.title"]],
  [
    "HomepagePricing.compare.${*}",
    [
      "HomepagePricing.compare.cancelAnytime",
      "HomepagePricing.compare.gdpr",
      "HomepagePricing.compare.noLimits",
      "HomepagePricing.compare.openSource",
    ],
  ],
  ["Inbox.threadStates.${*}", THREAD_STATE_KEYS],
  ["OnboardingWizard.ai.choices.${*}", ONBOARDING_CHOICE_KEYS],
  ["OnboardingWizard.ai.install.instruction.${*}", ONBOARDING_INSTALL_KEYS],
  ["OnboardingWizard.ai.methods.${*}.description", onboardingMethodKeys("description")],
  ["OnboardingWizard.ai.methods.${*}.meta", onboardingMethodKeys("meta")],
  ["OnboardingWizard.ai.methods.${*}.note", onboardingMethodKeys("note")],
  ["OnboardingWizard.ai.methods.${*}.title", onboardingMethodKeys("title")],
  ["OnboardingWizard.ai.openai.methods.${*}.description", onboardingOpenAiMethodKeys("description")],
  ["OnboardingWizard.ai.openai.methods.${*}.meta", onboardingOpenAiMethodKeys("meta")],
  ["OnboardingWizard.ai.openai.methods.${*}.note", onboardingOpenAiMethodKeys("note")],
  ["OnboardingWizard.ai.openai.methods.${*}.title", onboardingOpenAiMethodKeys("title")],
  ["OnboardingWizard.steps.${*}.subtitle", ONBOARDING_STEP_SUBTITLE_KEYS],
  ["OnboardingWizard.steps.${*}.title", ONBOARDING_STEP_TITLE_KEYS],
  ["RoleModal.resources.${*}", ROLE_RESOURCE_KEYS],
  ["Subscription.picker.features.${*}", SUBSCRIPTION_FEATURE_KEYS],
  ["Subscription.planNames.${*}", SUBSCRIPTION_PLAN_KEYS],
  ["Subscription.status.${*}", SUBSCRIPTION_STATUS_KEYS],
  ["WebhookDeliveryModal.deliveryStatus.${*}", WEBHOOK_DELIVERY_STATUS_KEYS],
  ["documents.${*}", LEGAL_DOCUMENT_KEYS],
  ["AgentChat.activity.resource.${*}", AGENT_ACTIVITY_RESOURCE_KEYS],
  ["AgentChat.activity.resourceSingular.${*}", AGENT_ACTIVITY_RESOURCE_SINGULAR_KEYS],
  ["AgentChat.activity.label.${*}", AGENT_ACTIVITY_LABEL_KEYS],
  ["AgentChat.activity.state.${*}.${*}", AGENT_ACTIVITY_STATE_KEYS],
  ["AgentChat.approval.${*}", AGENT_APPROVAL_RESOLUTION_KEYS],
  ["AgentChat.credits.blocked.${*}", AGENT_CREDIT_BLOCKED_KEYS],
  ["AgentChat.suggestions.pages.${*}.${*}.${*}.label", AGENT_SUGGESTION_KEYS.map((key) => `${key}.label`)],
  ["AgentChat.suggestions.pages.${*}.${*}.${*}.prompt", AGENT_SUGGESTION_KEYS.map((key) => `${key}.prompt`)],
  ["AgentChat.suggestions.readOnly.${*}.label", AGENT_READ_ONLY_SUGGESTION_KEYS.map((key) => `${key}.label`)],
  ["AgentChat.suggestions.readOnly.${*}.prompt", AGENT_READ_ONLY_SUGGESTION_KEYS.map((key) => `${key}.prompt`)],
]);

const DYNAMIC_SITE_CONSUMERS = new Map<string, readonly string[]>([
  [
    "app/[locale]/(protected)/company/components/feedback/feedback-modal.tsx :: t :: ${translationKey}.description",
    FEEDBACK_DESCRIPTION_KEYS,
  ],
  [
    "app/[locale]/(protected)/company/components/feedback/feedback-modal.tsx :: t :: ${translationKey}.title",
    FEEDBACK_TITLE_KEYS,
  ],
  ["components/entity-terminology/use-column-label.ts :: t :: Common.table.columns.${columnId}", TABLE_COLUMN_KEYS],
  ["components/entity-terminology/use-column-label.ts :: t.has :: Common.table.columns.${columnId}", TABLE_COLUMN_KEYS],
  [
    'components/entity-terminology/use-filter-field-label.ts :: t :: Common.filters.fields.${field.replace(/\\./g, "_")}',
    FILTER_FIELD_KEYS,
  ],
  ["components/forms/use-form-field.ts :: t :: Common.inputs.${id}", FORM_FIELD_INPUT_KEYS],
  ["ee/subscription/entitlement.service.ts :: t :: ConnectedAccountsCard.${code}", ENTITLEMENT_DENIAL_KEYS],
]);

const ENFORCED = true;

export const DYNAMIC_KEY_SITES = [
  "app/[locale]/(protected)/operator/components/workspaces/operator-workspace-modal.tsx :: t :: Common.providers.${channel.provider}",
  "app/[locale]/(protected)/operator/components/users/use-operator-user-columns.tsx :: t :: Common.userStatuses.${row.original.status}",
  "app/[locale]/(protected)/operator/components/users/use-operator-user-columns.tsx :: t :: Subscription.planNames.${row.original.plan}",
  "app/[locale]/(protected)/operator/components/users/use-operator-user-columns.tsx :: t :: Subscription.status.${row.original.subscriptionStatus}",
  "app/[locale]/(protected)/operator/components/workspaces/operator-workspace-modal.tsx :: t :: Subscription.planNames.${workspace.plan}",
  "app/[locale]/(protected)/operator/components/workspaces/use-operator-workspace-columns.tsx :: t :: Subscription.planNames.${row.original.plan}",
  "app/[locale]/(protected)/operator/components/workspaces/use-operator-workspace-columns.tsx :: t :: Subscription.status.${row.original.subscriptionStatus}",
  "app/[locale]/(protected)/operator/components/operator-value-labels.tsx :: t :: Common.events.${action}",
  "app/[locale]/(protected)/operator/components/use-operator-chip-options.ts :: t :: Common.userStatuses.${status}",
  "app/[locale]/(protected)/operator/components/use-operator-chip-options.ts :: t :: Subscription.planNames.${plan}",
  "app/[locale]/(protected)/operator/components/use-operator-chip-options.ts :: t :: Subscription.status.${status}",
  "app/[locale]/(protected)/company/components/audit-log/audit-log-modal.tsx :: t :: Common.events.${auditLog.event}",
  "components/data-transfer/import-wizard.tsx :: t :: Common.providers.${provider}",
  "components/data-transfer/import-wizard.tsx :: t :: DataTransfer.import.issues.${issue.code}",
  "app/[locale]/(protected)/company/components/audit-log/use-audit-log-columns.tsx :: t :: Common.events.${row.original.event}",
  "app/[locale]/(protected)/company/components/feedback/feedback-modal.tsx :: t :: ${translationKey}.description",
  "app/[locale]/(protected)/company/components/feedback/feedback-modal.tsx :: t :: ${translationKey}.title",
  "app/[locale]/(protected)/company/components/role/role-modal.tsx :: t :: RoleModal.resources.${resource}",
  "app/[locale]/(protected)/company/components/subscription/plan-picker.tsx :: t :: Subscription.planNames.${plan}",
  "app/[locale]/(protected)/company/components/subscription/plan-picker.tsx :: t.raw :: Subscription.picker.features.${plan}",
  "app/[locale]/(protected)/company/components/subscription/subscription-panel.tsx :: t :: Subscription.planNames.${subscription?.plan ?? SubscriptionPlan.pro}",
  "app/[locale]/(protected)/company/components/subscription/subscription-panel.tsx :: t :: Subscription.status.${subscription?.status ?? SubscriptionStatus.trial}",
  "app/[locale]/(protected)/company/components/user/use-member-columns.tsx :: t :: Common.userStatuses.${row.original.status}",
  "app/[locale]/(protected)/company/components/user/user-modal.tsx :: t :: Common.userStatuses.${key}",
  "app/[locale]/(protected)/company/components/webhook/use-webhook-columns.tsx :: t :: Common.events.${event}",
  "app/[locale]/(protected)/company/components/webhook/use-webhook-delivery-columns.tsx :: t :: Common.events.${row.original.event}",
  "app/[locale]/(protected)/company/components/webhook/use-webhook-delivery-columns.tsx :: t :: WebhookDeliveryModal.deliveryStatus.${row.original.status}",
  "app/[locale]/(protected)/company/components/webhook/webhook-delivery-modal.tsx :: t :: Common.events.${delivery.event}",
  "app/[locale]/(protected)/company/components/webhook/webhook-delivery-modal.tsx :: t :: WebhookDeliveryModal.deliveryStatus.${delivery.status}",
  "app/[locale]/(protected)/company/components/webhook/webhook-modal.tsx :: t :: Common.events.${item.key}",
  "app/[locale]/(protected)/contacts/components/add-channel-popover.tsx :: t :: Common.providers.${provider}",
  "app/[locale]/(protected)/contacts/components/channel-icon-stack.tsx :: t :: Common.providers.${channelLabelKey(id.provider)}",
  "app/[locale]/(protected)/contacts/components/channel-icon-stack.tsx :: t :: Common.providers.${channelLabelKey(provider)}",
  "app/[locale]/(protected)/contacts/components/contact-channels.tsx :: t :: Common.providers.${channelLabelKey(identifier.provider)}",
  "app/[locale]/(protected)/contacts/components/contact-compose-popover.tsx :: t :: Common.providers.${provider}",
  "app/[locale]/(protected)/dashboard/components/activity-filter-fields.tsx :: t :: Common.filters.operators.${filter.operator}",
  "app/[locale]/(protected)/dashboard/components/activity-filter-fields.tsx :: t :: Dashboard.widgetEditor.filters.activityTypeOptions.${value}.description",
  "app/[locale]/(protected)/dashboard/components/activity-filter-fields.tsx :: t :: Dashboard.widgetEditor.filters.activityTypeOptions.${value}.label",
  "app/[locale]/(protected)/dashboard/components/widget-display-type-picker.tsx :: t :: Dashboard.displayTypes.${type}",
  "app/[locale]/(protected)/dashboard/components/widget-filter-chip.tsx :: t :: Common.filters.operators.${filter.operator}",
  "app/[locale]/(protected)/dashboard/components/widget-preview.tsx :: t :: Dashboard.displayTypes.${displayType}",
  "app/[locale]/(protected)/dashboard/components/widget-starter-picker.tsx :: t :: Dashboard.widgetEditor.kind.${kind}Description",
  "app/[locale]/(protected)/dashboard/components/widget-starter-picker.tsx :: t :: Dashboard.widgetKinds.${kind}",
  "app/[locale]/(protected)/dashboard/components/widget-starter-picker.tsx :: t :: Dashboard.widgetKinds.${widget.kind}",
  "app/[locale]/(protected)/inbox/components/thread-row.tsx :: t :: Common.providers.${thread.provider}",
  "app/[locale]/(protected)/inbox/components/thread-row.tsx :: t :: Inbox.threadStates.${thread.state}",
  "app/[locale]/(protected)/inbox/components/thread-state-picker.tsx :: t :: Inbox.threadStates.${state}",
  "app/[locale]/(protected)/inbox/components/thread-state-picker.tsx :: t :: Inbox.threadStates.${s}",
  "app/[locale]/(protected)/onboarding/wizard/components/onboarding-wizard.tsx :: t :: OnboardingWizard.steps.${currentStep}.subtitle",
  "app/[locale]/(protected)/onboarding/wizard/components/onboarding-wizard.tsx :: t :: OnboardingWizard.steps.${currentStep}.title",
  "app/[locale]/(protected)/profile/components/account-status-color.ts :: t :: Common.providers.${account.provider}",
  "app/[locale]/(protected)/profile/components/api-key-modal.tsx :: t :: OnboardingWizard.ai.choices.${aiConnectionStore.route.provider}",
  "app/[locale]/(protected)/profile/components/connected-account-modal.tsx :: t :: ConnectedAccountsCard.statusLabels.${account.status}",
  "app/[locale]/(protected)/profile/components/connected-accounts-page-view.tsx :: t :: ConnectedAccountsCard.statusLabels.${account.status}",
  "app/[locale]/(protected)/profile/components/profile-settings-form.tsx :: t :: Common.locales.${detectBrowserUiLocale()}",
  "app/[locale]/(protected)/profile/components/profile-settings-form.tsx :: t :: Common.locales.${key}",
  "app/[locale]/(protected)/profile/components/profile-settings-form.tsx :: t :: Common.themes.${key}",
  "app/[locale]/(protected)/profile/components/profile-settings-form.tsx :: t :: Common.themes.${systemTheme}",
  "app/[locale]/(protected)/profile/components/user-details-avatar.tsx :: t :: Common.userStatuses.${status}",
  "app/[locale]/(public)/auth/error/error-page-content.tsx :: t :: ErrorCard.${errorKey}",
  "app/[locale]/(public)/auth/social-error-toast.tsx :: t :: AuthSocialErrors.${key}",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.${card.titleKey}.${card.badgeKey}",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.${card.titleKey}.${card.compareTextKey}",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.${card.titleKey}.${card.periodKey}",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.${card.titleKey}.${featureKey}",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.${card.titleKey}.ctaText",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.${card.titleKey}.tag",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.${card.titleKey}.title",
  "app/[locale]/(static)/components/homepage-pricing.tsx :: t :: HomepagePricing.compare.${key}",
  "app/components/agent-chat/agent-chat-items.tsx :: t :: AgentChat.approval.${item.resolution}",
  "app/components/agent-chat/credit-blocked-notice.tsx :: t :: AgentChat.credits.blocked.${reason}",
  "app/components/agent-chat/usage-ring.tsx :: t :: Subscription.planNames.${usage.plan}",
  "app/components/navigation/plan-subtitle.ts :: t :: Subscription.planNames.${plan}",
  "app/components/navigation/plan-subtitle.ts :: t :: Subscription.status.${status}",
  "components/ai-connection/ai-connection-api-key-setup.tsx :: t :: OnboardingWizard.ai.choices.${tool}",
  "components/ai-connection/ai-connection-api-key-setup.tsx :: t :: OnboardingWizard.ai.install.instruction.${tool}",
  "components/ai-connection/ai-connection-claude-setup.tsx :: t :: OnboardingWizard.ai.choices.${candidate}",
  "components/ai-connection/ai-connection-claude-setup.tsx :: t :: OnboardingWizard.ai.methods.${candidate}.description",
  "components/ai-connection/ai-connection-claude-setup.tsx :: t :: OnboardingWizard.ai.methods.${candidate}.meta",
  "components/ai-connection/ai-connection-claude-setup.tsx :: t :: OnboardingWizard.ai.methods.${candidate}.note",
  "components/ai-connection/ai-connection-claude-setup.tsx :: t :: OnboardingWizard.ai.methods.${candidate}.title",
  "components/ai-connection/ai-connection-flow.tsx :: t :: OnboardingWizard.ai.choices.${provider}",
  "components/ai-connection/ai-connection-openai-setup.tsx :: t :: OnboardingWizard.ai.openai.methods.${candidate}.description",
  "components/ai-connection/ai-connection-openai-setup.tsx :: t :: OnboardingWizard.ai.openai.methods.${candidate}.meta",
  "components/ai-connection/ai-connection-openai-setup.tsx :: t :: OnboardingWizard.ai.openai.methods.${candidate}.note",
  "components/ai-connection/ai-connection-openai-setup.tsx :: t :: OnboardingWizard.ai.openai.methods.${candidate}.title",
  "components/ai-connection/ai-connection-provider-grid.tsx :: t :: OnboardingWizard.ai.choices.${provider}",
  "components/data-view/custom-columns/custom-column-modal.tsx :: t :: Common.colors.${color}",
  "components/data-view/custom-columns/custom-column-modal.tsx :: t :: Common.colors.${option.color}",
  "components/data-view/custom-columns/custom-column-modal.tsx :: t :: Common.customColumnTypes.${item.value}",
  "components/data-view/filter-modal/filter-field.tsx :: t :: Common.filters.operators.${key}",
  "components/data-view/filter-modal/inputs/filter-input-iso-date-range.tsx :: t :: Common.datePresets.${key}",
  "components/data-view/filter-modal/inputs/filter-input-iso-date.tsx :: t :: Common.datePresets.${preset.key}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Common.events.${event}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Common.providers.${account.provider}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Common.providers.${provider}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Common.providers.${thread.provider}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Common.userStatuses.${status}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: EntityTimeline.types.${type}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Subscription.planNames.${plan}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Subscription.status.${status}",
  "components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: Inbox.threadStates.${state}",
  "components/data-view/filter-modal/use-filter-operator-label.ts :: t :: Common.filters.operators.${operator}",
  "components/data-view/group-label.ts :: t :: Common.dateBuckets.${bucket}",
  "components/entity-terminology/use-column-label.ts :: t :: AuditLogModal.fields.${columnId}",
  "components/entity-terminology/use-column-label.ts :: t :: Common.table.columns.${columnId}",
  "components/entity-terminology/use-column-label.ts :: t.has :: AuditLogModal.fields.${columnId}",
  "components/entity-terminology/use-column-label.ts :: t.has :: Common.table.columns.${columnId}",
  "components/forms/form-iso-date-picker.tsx :: t :: Common.datePresets.${preset.key}",
  "components/forms/form-iso-date-range-picker.tsx :: t :: Common.datePresets.${key}",
  "components/forms/use-form-field.ts :: t :: Common.inputs.${id}",
  "components/shared/locale-menu.tsx :: t :: Common.locales.${currentLocale}",
  "components/shared/locale-menu.tsx :: t :: Common.locales.${locale}",
  "core/validation/zod-error-map-server.ts :: t.raw :: Common.errors.${code}",
  "ee/lifecycle/send-legal-document-notices.interactor.ts :: t :: documents.${document}",
  "features/auth/sign-in-with-email.interactor.ts :: t :: Common.errors.${res.error}",
  "features/auth/sign-up-with-email.interactor.ts :: t :: Common.errors.${res.error}",
  "ee/messaging/connect/delete-accounts-for-plan.interactor.ts :: t :: Common.providers.${account.provider}",
  "ee/messaging/connect/delete-accounts-for-plan.interactor.ts :: t :: Subscription.planNames.${plan}",
  "ee/subscription/entitlement.service.ts :: t :: ConnectedAccountsCard.${code}",
  "ee/agent-chat/agent-activity.ts :: t :: AgentChat.activity.label.${name}",
  "ee/agent-chat/agent-activity.ts :: t :: AgentChat.activity.resource.${activity.resource}",
  "ee/agent-chat/agent-activity.ts :: t :: AgentChat.activity.resourceSingular.${resourceKey}",
  "ee/agent-chat/agent-activity.ts :: t :: AgentChat.activity.state.${activity.kind}.${name}",
  "ee/agent-chat/agent-page-actions.ts :: t :: AgentChat.suggestions.pages.${page}.${state}.${id}.label",
  "ee/agent-chat/agent-page-actions.ts :: t :: AgentChat.suggestions.pages.${page}.${state}.${id}.prompt",
  "ee/agent-chat/agent-page-actions.ts :: t :: AgentChat.suggestions.readOnly.${id}.label",
  "ee/agent-chat/agent-page-actions.ts :: t :: AgentChat.suggestions.readOnly.${id}.prompt",
  "features/messaging/activities/activities-detail-modal.tsx :: t :: Common.events.${entry.event}",
  "features/messaging/activities/activities-detail-modal.tsx :: t :: Common.providers.${event.provider}",
  "features/messaging/activities/activities-detail-modal.tsx :: t :: Common.providers.${message.provider}",
  "features/messaging/activities/activities-list.tsx :: t :: Common.events.${entry.event}",
  "features/messaging/activities/activities-list.tsx :: t :: Common.providers.${ev.provider}",
  "features/messaging/activities/activities-list.tsx :: t :: Common.providers.${message.provider}",
  "features/messaging/activities/audit-detail.tsx :: t :: Common.customColumnTypes.${String(value)}",
  "features/messaging/activities/audit-detail.tsx :: t :: Common.events.${entry.event}",
  "features/messaging/activities/audit-detail.tsx :: t :: Common.providers.${String(value)}",
  "features/messaging/activities/audit-detail.tsx :: t :: Common.userStatuses.${String(value)}",
  "features/messaging/activities/audit-detail.tsx :: t :: LegalDocumentNotice.documents.${document}",
  "features/messaging/activities/audit-detail.tsx :: t.has :: Common.customColumnTypes.${String(value)}",
  "features/messaging/activities/audit-detail.tsx :: t.has :: Common.providers.${String(value)}",
  "features/messaging/activities/audit-detail.tsx :: t.has :: Common.userStatuses.${String(value)}",
  "features/messaging/activities/audit-detail.tsx :: t.has :: LegalDocumentNotice.documents.${document}",
  "features/user/prisma-user.repository.ts :: t :: Common.defaultData.${column.entityType}.columnLabel",
  "features/user/prisma-user.repository.ts :: t :: Common.defaultData.${column.entityType}.options.${option.key}",
  'components/entity-terminology/use-filter-field-label.ts :: t :: Common.filters.fields.${field.replace(/\\./g, "_")}',
];

const NONLITERAL_T_CALL_SITES = new Map<string, number>([
  ["core/validation/interactor-failure-server.ts :: t.raw :: code", 1],
  ["features/mcp-tools/mcp-tool.ts :: t.raw :: customCode", 1],
  [
    'features/messaging/activities/audit-detail.tsx :: t :: terminologyMessageKey(selection.entityType, presetKey, "plural") as never',
    1,
  ],
  ["app/[locale]/(protected)/operator/components/operator-value-labels.tsx :: t :: key", 1],
  ["app/[locale]/(protected)/contacts/components/add-channel-popover.tsx :: t :: SOURCE_HINT_KEYS[source]", 1],
  ["app/[locale]/(protected)/contacts/components/use-contact-columns.tsx :: t :: nameKey", 1],
  ["app/[locale]/(protected)/deals/components/use-deal-columns.tsx :: t :: nameKey", 1],
  ["app/[locale]/(protected)/inbox/components/attachment-classify.ts :: t :: typeLabelKey", 2],
  ["app/[locale]/(protected)/inbox/components/message-item.tsx :: t :: labelKey", 1],
  ["app/[locale]/(protected)/inbox/components/thread-row.tsx :: t :: PREVIEW_KIND_LABEL[thread.previewKind]", 1],
  [
    'app/[locale]/(protected)/onboarding/wizard/components/step-profile.tsx :: t.rich :: isInvited ? "OnboardingForm.invitedAgreeToTerms" : "OnboardingForm.agreeToTerms"',
    1,
  ],
  ["app/[locale]/(protected)/organizations/components/use-organization-columns.tsx :: t :: nameKey", 1],
  ["app/[locale]/(protected)/profile/components/connected-accounts-page-view.tsx :: t :: option.labelKey", 1],
  ["app/[locale]/(protected)/profile/components/connected-accounts-status-toast.tsx :: t :: keys.descriptionKey", 1],
  ["app/[locale]/(protected)/profile/components/connected-accounts-status-toast.tsx :: t :: keys.titleKey", 1],
  ["app/[locale]/(protected)/services/components/use-service-columns.tsx :: t :: nameKey", 1],
  [
    "app/[locale]/(protected)/tasks/components/task-detail-view.tsx :: t.rich :: systemTaskAlertConfig.translationKey",
    1,
  ],
  ["app/[locale]/(protected)/tasks/components/task-detail.store.ts :: this.t :: nameTranslationKey", 1],
  ["app/[locale]/(protected)/tasks/components/use-task-columns.tsx :: t :: nameKey", 1],
  ["app/[locale]/(static)/docs/[slug]/page.tsx :: t :: navKey", 1],
  ["app/[locale]/(static)/docs/openapi/page.tsx :: t :: navKey", 1],
  ["app/[locale]/(static)/docs/page.tsx :: t :: navKey", 1],
  ["app/[locale]/(static)/docs/components/docs-sidebar.tsx :: t :: group.i18nKey", 1],
  ["app/[locale]/(static)/docs/components/docs-sidebar.tsx :: t :: item.i18nKey", 1],
  ["app/components/app-sidebar.tsx :: t :: subroute.labelKey", 3],
  ["app/components/app-topbar-crumbs.ts :: t :: leafKey", 1],
  ["app/components/app-topbar-crumbs.ts :: t :: operatorSubroute.labelKey", 1],
  ["app/components/app-topbar-crumbs.ts :: t :: route.labelKey", 2],
  ["app/components/app-topbar-crumbs.ts :: t :: subroute.labelKey", 1],
  ["components/card/form-actions.tsx :: t :: primaryButtonLabel", 1],
  ["components/data-transfer/import-wizard.tsx :: t :: field.labelKey", 1],
  ["components/data-view/group-label.ts :: t :: group.labelKey", 1],
  ["components/data-view/header/display-options.tsx :: t :: field.labelKey", 1],
  ["components/data-transfer/import-wizard.tsx :: t :: labelKey", 1],
  ["components/data-view/filter-modal/inputs/use-filter-select-items.tsx :: t :: nameKey", 1],
  ["components/entity-detail/entity-detail.registry.tsx :: t :: key", 1],
  ["components/entity-detail/relation-fields.tsx :: t :: nameKey", 1],
  ["components/entity-terminology/use-entity-terminology.ts :: t :: key", 1],
  ["core/base/base.store.ts :: this.t :: action.labelKey", 1],
  ["core/base/base.store.ts :: this.t :: key", 2],
  ["core/base/base.store.ts :: this.t :: options.descriptionKey", 1],
  ["ee/messaging/connect/create-auth-link.interactor.ts :: t :: denial.key", 1],
  ["features/company/get-company-settings.interactor.ts :: t :: key", 1],
  ["features/mcp-tools/utils.ts :: t.raw :: code", 1],
  ["features/messaging/activities/activities-detail-modal.tsx :: t :: responseKey as never", 1],
  [
    "features/messaging/activities/activities-list.tsx :: t :: PREVIEW_KIND_LABEL[classifyAttachment(firstAttachment)]",
    1,
  ],
  ["features/messaging/activities/audit-detail.tsx :: t :: nameKey", 1],
  ["features/messaging/activities/audit-detail.tsx :: t :: systemTaskKey as never", 1],
]);

const SOURCE_DIRECTORIES = ["app", "components", "constants", "core", "ee", "features", "hooks", "i18n", "workflows"];

type SourceEvidence = {
  kind: "literal" | "property" | "template";
  value: string;
  file?: string;
};

type IndirectKeyConsumer = {
  file: string;
  keys: readonly string[];
  evidence?: Readonly<Record<string, readonly SourceEvidence[]>>;
};

const OPERATOR_AUDIT_ACTION_LABEL_KEYS = Object.keys(OPERATOR_AUDIT_ACTION).map(
  (name) => `OperatorAudit.values.action.${name}`,
);
const OPERATOR_AUDIT_ACTION_LABEL_EVIDENCE = Object.fromEntries(
  OPERATOR_AUDIT_ACTION_LABEL_KEYS.map((key) => [
    key,
    [{ kind: "template" as const, value: "`OperatorAudit.values.action.${name}`" }],
  ]),
);
const TERMINOLOGY_TEMPLATE_EVIDENCE = Object.fromEntries(
  ENTITY_TERMINOLOGY_KEYS.map((key) => [
    key,
    [
      {
        kind: "template" as const,
        value:
          "`EntityTerminology.presets.${entityType}.${resolveTerminologyPresetKey(entityType, presetKey)}.${form}`",
      },
    ],
  ]),
);

const INDIRECT_KEY_CONSUMERS: readonly IndirectKeyConsumer[] = [
  {
    file: "app/[locale]/(protected)/operator/components/operator-value-labels.tsx",
    keys: OPERATOR_AUDIT_ACTION_LABEL_KEYS,
    evidence: OPERATOR_AUDIT_ACTION_LABEL_EVIDENCE,
  },
  {
    file: "app/[locale]/(protected)/contacts/components/add-channel-popover.tsx",
    keys: [
      "EntityChannels.addChannel.sourceContacts",
      "EntityChannels.addChannel.sourceConversations",
      "EntityChannels.addChannel.sourceLookup",
    ],
  },
  {
    file: "features/entity-terminology/entity-terminology.constants.ts",
    keys: ENTITY_TERMINOLOGY_KEYS,
    evidence: TERMINOLOGY_TEMPLATE_EVIDENCE,
  },
  {
    file: "features/event/entity-name.utils.ts",
    keys: ["Common.company"],
  },
  {
    file: "core/base/grouping/groupable-field.ts",
    keys: TASK_TYPE_KEYS,
    evidence: Object.fromEntries(
      TASK_TYPE_KEYS.map((key) => [key, [{ kind: "template" as const, value: "`Common.taskTypes.${value}`" }]]),
    ),
  },
  {
    file: "app/[locale]/(protected)/dashboard/components/widget-label.ts",
    keys: DIAGRAM_SYSTEM_KEYS,
    evidence: Object.fromEntries(
      DIAGRAM_SYSTEM_LABEL_KEYS.map((key) => [
        `Diagrams.${key}`,
        [
          {
            kind: "template" as const,
            value: "`Diagrams.${item.systemLabelKey}`",
          },
          {
            file: "features/widget/widget.schema.ts",
            kind: "literal" as const,
            value: key,
          },
        ],
      ]),
    ),
  },
  {
    file: "features/messaging/activities/activities-detail-modal.tsx",
    keys: [
      "ContactHistory.calendarResponseMaybe",
      "ContactHistory.calendarResponseNo",
      "ContactHistory.calendarResponseNoreply",
      "ContactHistory.calendarResponseYes",
    ],
  },
  {
    file: "app/[locale]/(protected)/inbox/components/attachment-classify.ts",
    keys: [
      "Inbox.fileTypeExcel",
      "Inbox.fileTypeImage",
      "Inbox.fileTypePdf",
      "Inbox.fileTypePowerpoint",
      "Inbox.fileTypeWord",
    ],
  },
  {
    file: "ee/messaging/attachment-kind.ts",
    keys: [
      "Inbox.previewAudio",
      "Inbox.previewFile",
      "Inbox.previewGif",
      "Inbox.previewPhoto",
      "Inbox.previewPost",
      "Inbox.previewSticker",
      "Inbox.previewUnsupported",
      "Inbox.previewVideo",
      "Inbox.previewVoice",
    ],
  },
  {
    file: "app/[locale]/(protected)/onboarding/wizard/components/step-profile.tsx",
    keys: ["OnboardingForm.agreeToTerms", "OnboardingForm.invitedAgreeToTerms"],
  },
  {
    file: "app/components/app-topbar-crumbs.ts",
    keys: ["UserAvatar.settings"],
    evidence: {
      "UserAvatar.settings": [
        { kind: "template", value: "`UserAvatar.${entry.labelKey}`" },
        {
          kind: "property",
          value: 'settings: { group: "settings", labelKey: "settings" }',
        },
      ],
    },
  },
  {
    file: "ee/messaging/connect/create-auth-link.interactor.ts",
    keys: ["ConnectedAccountsCard.accountLimitReached", "ConnectedAccountsCard.upgradeToBusinessForMoreAccounts"],
  },
  {
    file: "app/[locale]/(protected)/profile/components/connected-accounts-status-toast.tsx",
    keys: [
      "ConnectedAccountsCard.alreadyExistsToastDescription",
      "ConnectedAccountsCard.alreadyExistsToastTitle",
      "ConnectedAccountsCard.checkpointToastDescription",
      "ConnectedAccountsCard.checkpointToastTitle",
      "ConnectedAccountsCard.disconnectedToastDescription",
      "ConnectedAccountsCard.disconnectedToastTitle",
      "ConnectedAccountsCard.expiredLinkToastDescription",
      "ConnectedAccountsCard.expiredLinkToastTitle",
      "ConnectedAccountsCard.failedToastDescription",
      "ConnectedAccountsCard.failedToastTitle",
      "ConnectedAccountsCard.invalidCredentialsToastDescription",
      "ConnectedAccountsCard.invalidCredentialsToastTitle",
    ],
  },
] as const;

const T_CALL_PATTERN =
  /(?:(?<![\w$.])|(?<=this\.))(t(?:\.(?:rich|raw|markup|has))?)\(\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g;
const GET_TRANSLATION_PATTERN = /(?<![\w$])(getTranslation)\(\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g;
const NAMESPACE_PATTERN = /(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g;
const TRANSLATOR_NAMESPACE_PATTERN = /getTranslator\(\s*[^,)]+,\s*"([^"]+)"\s*\)/g;
const STRING_LITERAL_PATTERN = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const INDIRECT_TRANSLATION_KEY_PATTERN =
  /(?:alertTranslationKey|descriptionKey|i18nKey|labelKey|nameTranslationKey|primaryButtonLabel|titleKey|translationKey)\s*(?::|=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
const TOAST_CALL_PATTERN = /toast(?:Success|Error)\(([\s\S]*?)\);/g;

function loadCatalogPaths(): {
  leafPaths: Set<string>;
  nodePaths: Set<string>;
} {
  const raw = readFileSync(join(REPO_ROOT, "i18n", "locales", "en.json"), "utf8");
  const leafPaths = new Set<string>();
  const nodePaths = new Set<string>();
  const collect = (value: unknown, prefix: string) => {
    if (value !== null && typeof value === "object") {
      if (prefix) nodePaths.add(prefix);
      for (const [key, child] of Object.entries(value)) collect(child, prefix ? `${prefix}.${key}` : key);
      return;
    }
    leafPaths.add(prefix);
  };
  collect(JSON.parse(raw), "");
  return { leafPaths, nodePaths };
}

function resolves(key: string, namespaces: string[], catalog: ReturnType<typeof loadCatalogPaths>): boolean {
  if (catalog.leafPaths.has(key) || catalog.nodePaths.has(key)) return true;

  return namespaces.some(
    (namespace) => catalog.leafPaths.has(`${namespace}.${key}`) || catalog.nodePaths.has(`${namespace}.${key}`),
  );
}

function matchingStaticCatalogPaths(
  key: string,
  namespaces: string[],
  catalog: ReturnType<typeof loadCatalogPaths>,
): string[] {
  const candidates = new Set([key, ...namespaces.map((namespace) => `${namespace}.${key}`)]);

  return [...candidates].filter((candidate) => catalog.leafPaths.has(candidate) || catalog.nodePaths.has(candidate));
}

function normalizeDynamicTemplate(template: string): string {
  return template.replace(/\$\{[^}]+\}/g, "${*}");
}

const T_METHODS = new Set(["has", "markup", "raw", "rich"]);

function normalizeNodeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function translationCallee(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node) && node.text === "t") return "t";
  if (!ts.isPropertyAccessExpression(node)) return undefined;
  if (node.name.text === "t" && node.expression.kind === ts.SyntaxKind.ThisKeyword) return "this.t";
  if (!T_METHODS.has(node.name.text)) return undefined;

  const base = translationCallee(node.expression);
  return base === "t" || base === "this.t" ? `${base}.${node.name.text}` : undefined;
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;

  return current;
}

function scanNonliteralTranslationCalls(source: string, relPath: string, nonliteralSites: Map<string, number>): void {
  const sourceFile = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = translationCallee(node.expression);
      if (callee) {
        const firstArgument = node.arguments[0];
        if (!firstArgument) {
          const site = `${relPath} :: ${callee} :: <missing>`;
          nonliteralSites.set(site, (nonliteralSites.get(site) ?? 0) + 1);
        } else {
          const argument = unwrapExpression(firstArgument);
          if (!ts.isStringLiteralLike(argument) && !ts.isTemplateExpression(argument)) {
            const site = `${relPath} :: ${callee} :: ${normalizeNodeText(firstArgument.getText(sourceFile))}`;
            nonliteralSites.set(site, (nonliteralSites.get(site) ?? 0) + 1);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function loadSourceEvidence(file: string): {
  literals: Set<string>;
  properties: Set<string>;
  templates: Set<string>;
} | null {
  const absolutePath = join(REPO_ROOT, file);
  if (!existsSync(absolutePath)) return null;

  const source = readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const literals = new Set<string>();
  const properties = new Set<string>();
  const templates = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) literals.add(node.text);
    if (ts.isPropertyAssignment(node)) properties.add(normalizeNodeText(node.getText(sourceFile)));
    if (ts.isTemplateExpression(node)) templates.add(normalizeNodeText(node.getText(sourceFile)));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { literals, properties, templates };
}

function scanSources(): {
  staticViolations: string[];
  dynamicSites: Set<string>;
  consumerKeys: Set<string>;
  indirectViolations: string[];
  nonliteralSites: Map<string, number>;
} {
  const catalog = loadCatalogPaths();
  const staticViolations: string[] = [];
  const dynamicSites = new Set<string>();
  const dynamicTemplates = new Set<string>();
  const consumerKeys = new Set<string>();
  const indirectViolations: string[] = [];
  const nonliteralSites = new Map<string, number>();
  for (const directory of SOURCE_DIRECTORIES) {
    const files = walkFiles(
      join(REPO_ROOT, directory),
      (path) => /\.tsx?$/.test(path) && !path.includes("__tests__") && !/\.test\.tsx?$/.test(path),
    );
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const relPath = relative(REPO_ROOT, file);
      scanNonliteralTranslationCalls(source, relPath, nonliteralSites);
      const namespaces = [
        ...[...source.matchAll(NAMESPACE_PATTERN)].map((match) => match[1]),
        ...[...source.matchAll(TRANSLATOR_NAMESPACE_PATTERN)].map((match) => match[1]),
      ];
      for (const pattern of [T_CALL_PATTERN, GET_TRANSLATION_PATTERN]) {
        for (const match of source.matchAll(pattern)) {
          const [full, callee, argument] = match;
          const matchIndex = match.index ?? 0;
          const body = argument.slice(1, -1);
          const isTemplate = argument.startsWith("`");
          if (isTemplate && body.includes("${")) {
            const site = `${relPath} :: ${callee} :: ${body}`;
            dynamicSites.add(site);
            const template = normalizeDynamicTemplate(body);
            dynamicTemplates.add(template);
            const keys = DYNAMIC_SITE_CONSUMERS.get(site) ?? DYNAMIC_TEMPLATE_CONSUMERS.get(template);
            if (!keys) indirectViolations.push(`${site} has no exact dynamic consumer domain for template ${template}`);
            else if (keys.length === 0) indirectViolations.push(`${site} has an empty dynamic consumer domain`);
            else for (const leafPath of keys) consumerKeys.add(leafPath);

            continue;
          }
          if (
            !isTemplate &&
            source
              .slice(matchIndex + full.length)
              .trimStart()
              .startsWith("+")
          ) {
            const site = `${relPath} :: ${callee} :: ${body}`;
            dynamicSites.add(site);
            const keys = DYNAMIC_SITE_CONSUMERS.get(site);
            if (!keys) indirectViolations.push(`${site} has no exact concatenated-key consumer domain`);
            else if (keys.length === 0) indirectViolations.push(`${site} has an empty dynamic consumer domain`);
            else for (const leafPath of keys) consumerKeys.add(leafPath);

            continue;
          }
          if (!resolves(body, namespaces, catalog)) {
            const line = source.slice(0, matchIndex).split("\n").length;
            staticViolations.push(`${relPath}:${line} ${callee}("${body}")`);
            continue;
          }
          for (const candidate of matchingStaticCatalogPaths(body, namespaces, catalog)) {
            for (const leafPath of catalog.leafPaths)
              if (leafPath === candidate || leafPath.startsWith(`${candidate}.`)) consumerKeys.add(leafPath);
          }
        }
      }
      for (const match of source.matchAll(INDIRECT_TRANSLATION_KEY_PATTERN)) {
        const body = match[1].slice(1, -1);
        if (catalog.leafPaths.has(body)) consumerKeys.add(body);
        else if (body.includes("."))
          indirectViolations.push(`${relPath} references missing indirect catalog key ${body}`);
      }
      for (const toastCall of source.matchAll(TOAST_CALL_PATTERN)) {
        for (const match of toastCall[1].matchAll(STRING_LITERAL_PATTERN)) {
          const body = match[1] ?? match[2] ?? match[3];
          if (catalog.leafPaths.has(body)) consumerKeys.add(body);
          else if (/^[A-Za-z][\w-]*(?:\.[\w-]+)+$/.test(body))
            indirectViolations.push(`${relPath} references missing toast catalog key ${body}`);
        }
      }
    }
  }

  const evidenceCache = new Map<string, ReturnType<typeof loadSourceEvidence>>();
  const evidenceFor = (file: string) => {
    if (!evidenceCache.has(file)) evidenceCache.set(file, loadSourceEvidence(file));
    return evidenceCache.get(file) ?? null;
  };
  for (const { file, keys, evidence } of INDIRECT_KEY_CONSUMERS) {
    if (!evidenceFor(file)) indirectViolations.push(`${file} does not exist`);
    for (const key of keys) {
      if (!catalog.leafPaths.has(key)) indirectViolations.push(`${file} references missing catalog key ${key}`);
      const requirements = evidence?.[key] ?? [{ kind: "literal" as const, value: key }];
      const hasEvidence =
        requirements.length > 0 &&
        requirements.every((requirement) => {
          const index = evidenceFor(requirement.file ?? file);
          if (!index) return false;
          if (requirement.kind === "literal") return index.literals.has(requirement.value);
          if (requirement.kind === "property") return index.properties.has(requirement.value);
          return index.templates.has(requirement.value);
        });
      if (!hasEvidence) indirectViolations.push(`${file} has no declared source evidence for ${key}`);
      else if (catalog.leafPaths.has(key)) consumerKeys.add(key);
    }
    for (const key of Object.keys(evidence ?? {}))
      if (!keys.includes(key)) indirectViolations.push(`${file} has stale source evidence for ${key}`);
  }
  for (const [site, keys] of DYNAMIC_SITE_CONSUMERS) {
    if (!dynamicSites.has(site)) indirectViolations.push(`stale dynamic consumer override ${site}`);
    for (const key of keys)
      if (!catalog.leafPaths.has(key)) indirectViolations.push(`${site} references missing catalog key ${key}`);
  }
  for (const [template, keys] of DYNAMIC_TEMPLATE_CONSUMERS) {
    if (!dynamicTemplates.has(template)) indirectViolations.push(`stale dynamic consumer template ${template}`);
    for (const key of keys)
      if (!catalog.leafPaths.has(key)) indirectViolations.push(`${template} references missing catalog key ${key}`);
  }

  return {
    staticViolations,
    dynamicSites,
    consumerKeys,
    indirectViolations,
    nonliteralSites,
  };
}

describe("i18n key resolution", () => {
  const { staticViolations, dynamicSites, consumerKeys, indirectViolations, nonliteralSites } = scanSources();

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("resolves every static translation key against the catalog", () => {
    expect(staticViolations, `unresolvable translation keys:\n${staticViolations.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps every nonliteral translation call explicitly registered",
    () => {
      const actual = [...nonliteralSites].sort(([left], [right]) => left.localeCompare(right));
      const expected = [...NONLITERAL_T_CALL_SITES].sort(([left], [right]) => left.localeCompare(right));
      expect(actual).toEqual(expected);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("registers every dynamic translation key site", () => {
    const registered = new Set(DYNAMIC_KEY_SITES);
    const unregistered = [...dynamicSites].filter((site) => !registered.has(site)).sort();
    expect(unregistered, `dynamic key sites missing from DYNAMIC_KEY_SITES:\n${unregistered.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps the dynamic-site registry free of stale entries", () => {
    const stale = DYNAMIC_KEY_SITES.filter((site) => !dynamicSites.has(site));
    expect(stale, `stale DYNAMIC_KEY_SITES entries:\n${stale.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps explicit indirect consumers valid", () => {
    expect(indirectViolations, `invalid indirect translation consumers:\n${indirectViolations.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps event translations aligned with domain events", () => {
    const { leafPaths } = loadCatalogPaths();
    const translatedEvents = [...leafPaths]
      .filter((key) => key.startsWith("Common.events."))
      .map((key) => key.slice("Common.events.".length))
      .sort();
    const domainEvents = Object.values(DomainEvent).sort();
    expect(translatedEvents).toEqual(domainEvents);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps terminology translations aligned with presets", () => {
    const { leafPaths } = loadCatalogPaths();
    const translatedPresets = [...leafPaths].filter((key) => key.startsWith("EntityTerminology.presets.")).sort();
    expect(translatedPresets).toEqual([...ENTITY_TERMINOLOGY_KEYS].sort());
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps filter-field translations aligned with filter fields",
    () => {
      const { leafPaths } = loadCatalogPaths();
      const translatedFields = [...leafPaths].filter((key) => key.startsWith("Common.filters.fields.")).sort();
      expect(translatedFields).toEqual([...FILTER_FIELD_KEYS].sort());
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps role-resource translations aligned with role resources",
    () => {
      const { leafPaths } = loadCatalogPaths();
      const translatedResources = [...leafPaths].filter((key) => key.startsWith("RoleModal.resources.")).sort();
      expect(translatedResources).toEqual([...ROLE_RESOURCE_KEYS].sort());
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps display-type translations aligned with display types",
    () => {
      const { leafPaths } = loadCatalogPaths();
      const translatedDisplayTypes = [...leafPaths].filter((key) => key.startsWith("Dashboard.displayTypes.")).sort();
      expect(translatedDisplayTypes).toEqual([...DISPLAY_TYPE_KEYS].sort());
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps aggregation-type translations aligned with widget aggregation types",
    () => {
      const { leafPaths } = loadCatalogPaths();
      const translatedAggregationTypes = [...leafPaths]
        .filter((key) => key.startsWith("Dashboard.aggregationTypes."))
        .sort();
      expect(translatedAggregationTypes).toEqual([...AGGREGATION_TYPE_KEYS].sort());
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps date-preset translations aligned with rendered presets",
    () => {
      const { leafPaths } = loadCatalogPaths();
      const translatedDatePresets = [...leafPaths].filter((key) => key.startsWith("Common.datePresets.")).sort();
      expect(translatedDatePresets).toEqual([...DATE_PRESET_KEYS].sort());
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps error translations aligned with error codes", () => {
    const { leafPaths } = loadCatalogPaths();
    const translatedErrors = [...leafPaths].filter((key) => key.startsWith("Common.errors.")).sort();
    expect(translatedErrors).toEqual([...COMMON_ERROR_KEYS].sort());
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps canonical column translations aligned with rendered columns",
    () => {
      const { leafPaths } = loadCatalogPaths();
      const translatedColumns = [...leafPaths].filter((key) => key.startsWith("Common.table.columns.")).sort();
      expect(translatedColumns).toEqual([...TABLE_COLUMN_KEYS].sort());
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("maps every catalog leaf to a source consumer", () => {
    const { leafPaths } = loadCatalogPaths();
    const unconsumed = [...leafPaths].filter((key) => !consumerKeys.has(key)).sort();
    expect(unconsumed, `catalog keys without a source consumer:\n${unconsumed.join("\n")}`).toEqual([]);
  });
});
