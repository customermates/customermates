import type { McpTool } from "@/app/api/v1/mcp/mcp-route-utils";

import { createContactsTool, updateContactsTool } from "@/features/mcp-tools/contact.mcp-tools";
import { createOrganizationsTool, updateOrganizationsTool } from "@/features/mcp-tools/organization.mcp-tools";
import { createDealsTool, updateDealsTool } from "@/features/mcp-tools/deal.mcp-tools";
import { createServicesTool, updateServicesTool } from "@/features/mcp-tools/service.mcp-tools";
import { createTasksTool, updateTasksTool } from "@/features/mcp-tools/task.mcp-tools";
import {
  listWidgetsTool,
  getWidgetsTool,
  createWidgetTool,
  updateWidgetTool,
  deleteWidgetTool,
} from "@/features/mcp-tools/widget.mcp-tools";
import {
  listWebhooksTool,
  getWebhookTool,
  createWebhookTool,
  updateWebhookTool,
  deleteWebhookTool,
  listWebhookDeliveriesTool,
  resendWebhookDeliveryTool,
} from "@/features/mcp-tools/webhook.mcp-tools";
import { getCurrentUserTool, listUsersTool, updateMyProfileTool } from "@/features/mcp-tools/user.mcp-tools";
import { getCompanyTool, listRolesTool, updateCompanyTool } from "@/features/mcp-tools/company.mcp-tools";
import {
  listCustomColumnsTool,
  upsertCustomColumnTool,
  deleteCustomColumnTool,
} from "@/features/mcp-tools/custom-column.mcp-tools";
import {
  getEntityConfigurationTool,
  filterEntityTool,
  countEntityTool,
  getEntitiesTool,
  updateEntityNotesTool,
  appendEntityNotesTool,
  deleteEntitiesTool,
  updateEntityCustomFieldsTool,
  linkEntitiesTool,
  unlinkEntitiesTool,
  searchAllEntitiesTool,
} from "@/features/mcp-tools/entity-generic.mcp-tools";
import {
  listConnectedAccountsTool,
  getMessagingThreadsTool,
  getMessagingThreadTool,
  getActivitiesTool,
  sendEmailTool,
  sendChatMessageTool,
  startChatTool,
} from "@/features/mcp-tools/messaging.mcp-tools";

/**
 * The single source of truth for the MCP tool surface. Consumed both by the
 * external MCP HTTP endpoint (app/api/v1/mcp/route.ts) and by the in-app agent
 * chat (features/agent-chat/agent-tools.ts) so the two never drift apart.
 */
export const ALL_MCP_TOOLS: McpTool[] = [
  getEntityConfigurationTool,
  filterEntityTool,
  countEntityTool,
  searchAllEntitiesTool,
  getEntitiesTool,
  updateEntityNotesTool,
  appendEntityNotesTool,
  deleteEntitiesTool,
  updateEntityCustomFieldsTool,
  linkEntitiesTool,
  unlinkEntitiesTool,

  createContactsTool,
  updateContactsTool,

  createOrganizationsTool,
  updateOrganizationsTool,

  createDealsTool,
  updateDealsTool,

  createServicesTool,
  updateServicesTool,

  createTasksTool,
  updateTasksTool,

  listWidgetsTool,
  getWidgetsTool,
  createWidgetTool,
  updateWidgetTool,
  deleteWidgetTool,

  listWebhooksTool,
  getWebhookTool,
  createWebhookTool,
  updateWebhookTool,
  deleteWebhookTool,
  listWebhookDeliveriesTool,
  resendWebhookDeliveryTool,

  getCurrentUserTool,
  updateMyProfileTool,
  listUsersTool,

  getCompanyTool,
  updateCompanyTool,
  listRolesTool,

  listConnectedAccountsTool,
  getMessagingThreadsTool,
  getMessagingThreadTool,
  getActivitiesTool,
  sendEmailTool,
  sendChatMessageTool,
  startChatTool,

  listCustomColumnsTool,
  upsertCustomColumnTool,
  deleteCustomColumnTool,
];
