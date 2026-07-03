import { createMcpRoute } from "./mcp-route-utils";

import { getAuthService } from "@/core/di";

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

const ALL_TOOLS = [
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

export const maxDuration = 60;

const mcpHandler = createMcpRoute(ALL_TOOLS, "/api/v1/mcp");

async function handler(request: Request) {
  const session = await getAuthService().getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  return mcpHandler(request);
}

export { handler as GET, handler as POST };
