import type { $ZodRawIssue } from "zod/v4/core";

export enum CustomErrorCode {
  apiKeyMaxExpiration = "apiKeyMaxExpiration",
  emailMismatch = "emailMismatch",
  passwordMismatch = "passwordMismatch",
  passwordInvalid = "passwordInvalid",
  emailNotVerified = "emailNotVerified",
  invalidCredentials = "invalidCredentials",
  emailAlreadyExists = "emailAlreadyExists",
  termsNotAgreed = "termsNotAgreed",
  customColumnNotFound = "customColumnNotFound",
  customFieldInvalidEmail = "customFieldInvalidEmail",
  customFieldInvalidPhone = "customFieldInvalidPhone",
  customFieldInvalidUrl = "customFieldInvalidUrl",
  urlInvalidProtocol = "urlInvalidProtocol",
  customFieldInvalidCurrency = "customFieldInvalidCurrency",
  customFieldInvalidDate = "customFieldInvalidDate",
  customFieldInvalidSingleSelect = "customFieldInvalidSingleSelect",
  widgetGroupByCustomColumnIdRequired = "widgetGroupByCustomColumnIdRequired",
  widgetDealQuantityOnlyForService = "widgetDealQuantityOnlyForService",
  widgetGroupByEntityTypeNotAllowedForCount = "widgetGroupByEntityTypeNotAllowedForCount",
  widgetGroupByTypeMustMatchEntityType = "widgetGroupByTypeMustMatchEntityType",
  widgetDealFiltersNotAllowedForDealEntityType = "widgetDealFiltersNotAllowedForDealEntityType",
  widgetDealAggregationNotAllowedForTask = "widgetDealAggregationNotAllowedForTask",
  widgetTaskCanOnlyGroupByCustomColumn = "widgetTaskCanOnlyGroupByCustomColumn",
  taskOnlyCustomTasksCanBeDeleted = "taskOnlyCustomTasksCanBeDeleted",
  taskNameCannotBeChangedForSystemTasks = "taskNameCannotBeChangedForSystemTasks",
  organizationNotFound = "organizationNotFound",
  userNotFound = "userNotFound",
  dealNotFound = "dealNotFound",
  serviceNotFound = "serviceNotFound",
  contactNotFound = "contactNotFound",
  taskNotFound = "taskNotFound",
  invalidFilterField = "invalidFilterField",
  llmApiKeyInvalid = "llmApiKeyInvalid",
  invalidSortField = "invalidSortField",
  filterBetweenInvalidArrayLength = "filterBetweenInvalidArrayLength",
  notesInvalidFormat = "notesInvalidFormat",
  notesExceedsMaxLength = "notesExceedsMaxLength",
  generic = "generic",
}

export type ZodLocaleModule = {
  default: () => {
    localeError: (issue: $ZodRawIssue) => string;
  };
};
