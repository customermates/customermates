import { createMcpRoute } from "./mcp-route-utils";

import {
  createContactsTool,
  updateContactNameTool,
  setContactOrganizationsTool,
  setContactUsersTool,
  setContactDealsTool,
} from "@/features/mcp-tools/contact.mcp-tools";
import {
  createOrganizationsTool,
  updateOrganizationNameTool,
  changeOrganizationContactsTool,
  changeOrganizationUsersTool,
  changeOrganizationDealsTool,
} from "@/features/mcp-tools/organization.mcp-tools";
import {
  createDealsTool,
  updateDealNameTool,
  changeDealOrganizationsTool,
  changeDealUsersTool,
  changeDealContactsTool,
  changeDealServicesTool,
} from "@/features/mcp-tools/deal.mcp-tools";
import {
  createServicesTool,
  updateServiceNameAmountTool,
  changeServiceUsersTool,
  changeServiceDealsTool,
} from "@/features/mcp-tools/service.mcp-tools";
import { createTasksTool, updateTaskNameTool, changeTaskUsersTool } from "@/features/mcp-tools/task.mcp-tools";
import {
  getWidgetsTool,
  getWidgetDetailsTool,
  createWidgetTool,
  updateWidgetGroupingTool,
  updateWidgetAggregationTool,
  updateWidgetEntityFiltersTool,
  updateWidgetDealFiltersTool,
  updateWidgetDisplayOptionsTool,
} from "@/features/mcp-tools/widget.mcp-tools";
import {
  listWebhooksTool,
  createWebhookTool,
  updateWebhookTool,
  deleteWebhookTool,
} from "@/features/mcp-tools/webhook.mcp-tools";
import { getUserDetailsTool, getUsersTool } from "@/features/mcp-tools/user.mcp-tools";
import { getCompanyDetailsTool, getRolesTool } from "@/features/mcp-tools/company.mcp-tools";
import {
  addPlainCustomColumnTool,
  addDateCustomColumnTool,
  addDateTimeCustomColumnTool,
  addCurrencyCustomColumnTool,
  addSingleSelectCustomColumnTool,
  addLinkCustomColumnTool,
  addEmailCustomColumnTool,
  addPhoneCustomColumnTool,
} from "@/features/mcp-tools/custom-column.mcp-tools";
import {
  getEntityConfigurationTool,
  filterEntityTool,
  countEntityTool,
  getEntityDetailsTool,
  setEntityNotesTool,
  deleteEntityTool,
  updateEntityCustomFieldTool,
} from "@/features/mcp-tools/entity-generic.mcp-tools";

const ALL_TOOLS = [
  getEntityConfigurationTool,
  filterEntityTool,
  countEntityTool,
  getEntityDetailsTool,
  setEntityNotesTool,
  deleteEntityTool,
  updateEntityCustomFieldTool,

  createContactsTool,
  updateContactNameTool,
  setContactOrganizationsTool,
  setContactUsersTool,
  setContactDealsTool,

  createOrganizationsTool,
  updateOrganizationNameTool,
  changeOrganizationContactsTool,
  changeOrganizationUsersTool,
  changeOrganizationDealsTool,

  createDealsTool,
  updateDealNameTool,
  changeDealOrganizationsTool,
  changeDealUsersTool,
  changeDealContactsTool,
  changeDealServicesTool,

  createServicesTool,
  updateServiceNameAmountTool,
  changeServiceUsersTool,
  changeServiceDealsTool,

  createTasksTool,
  updateTaskNameTool,
  changeTaskUsersTool,

  getWidgetsTool,
  getWidgetDetailsTool,
  createWidgetTool,
  updateWidgetGroupingTool,
  updateWidgetAggregationTool,
  updateWidgetEntityFiltersTool,
  updateWidgetDealFiltersTool,
  updateWidgetDisplayOptionsTool,

  listWebhooksTool,
  createWebhookTool,
  updateWebhookTool,
  deleteWebhookTool,

  getUserDetailsTool,
  getUsersTool,

  getCompanyDetailsTool,
  getRolesTool,

  addPlainCustomColumnTool,
  addDateCustomColumnTool,
  addDateTimeCustomColumnTool,
  addCurrencyCustomColumnTool,
  addSingleSelectCustomColumnTool,
  addLinkCustomColumnTool,
  addEmailCustomColumnTool,
  addPhoneCustomColumnTool,
];

const handler = createMcpRoute(ALL_TOOLS, "/api/v1/mcp");

export { handler as GET, handler as POST };
