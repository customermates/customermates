import { createContactsTool, updateContactsTool } from "@/features/mcp-tools/contact.mcp-tools";
import { createDealsTool, updateDealsTool } from "@/features/mcp-tools/deal.mcp-tools";
import { createOrganizationsTool, updateOrganizationsTool } from "@/features/mcp-tools/organization.mcp-tools";
import { createServicesTool, updateServicesTool } from "@/features/mcp-tools/service.mcp-tools";
import { createTasksTool, updateTasksTool } from "@/features/mcp-tools/task.mcp-tools";
import { getDocsPageTool, searchDocsTool } from "@/features/mcp-tools/docs.mcp-tools";
import { getWorkspaceContextTool, listUsersTool } from "@/features/mcp-tools/workspace.mcp-tools";
import { fetchTool, searchTool } from "@/features/mcp-tools/deep-research.mcp-tools";
import { manageCustomColumnsTool } from "@/features/mcp-tools/custom-column.mcp-tools";
import { manageTeamTool, updateWorkspaceSettingsTool } from "@/features/mcp-tools/admin.mcp-tools";
import { manageWebhooksTool } from "@/features/mcp-tools/webhook.mcp-tools";
import { manageWidgetsTool } from "@/features/mcp-tools/widget.mcp-tools";
import { requestSupportTool } from "@/features/mcp-tools/support.mcp-tools";
import {
  deleteRecordsTool,
  getRecordSchemaTool,
  getRecordsTool,
  listRecordsTool,
  manageRecordLinksTool,
  searchRecordsTool,
  updateRecordNotesTool,
} from "@/features/mcp-tools/entity-generic.mcp-tools";
import {
  connectMessagingAccountTool,
  discardMessageDraftTool,
  getActivitiesTool,
  getCalendarsTool,
  getMessagingThreadsTool,
  saveMessageDraftTool,
  sendChatMessageTool,
  sendEmailTool,
  updateMessagingThreadTool,
} from "@/features/mcp-tools/messaging.mcp-tools";
import {
  getSocialPostEngagementTool,
  getSocialPostsTool,
  getSocialProfileTool,
  manageSocialRelationsTool,
} from "@/features/mcp-tools/social-posts.mcp-tools";
import {
  getSalesSearchParametersTool,
  manageSalesListsTool,
  searchSalesCompaniesTool,
  searchSalesLeadsTool,
} from "@/features/mcp-tools/sales-navigator.mcp-tools";

import type { McpTool } from "@/app/api/v1/mcp/mcp-route-utils";

export const MCP_TOOL_GROUPS: Record<string, McpTool[]> = {
  records: [
    getRecordSchemaTool,
    listRecordsTool,
    searchRecordsTool,
    getRecordsTool,
    createContactsTool,
    createOrganizationsTool,
    createDealsTool,
    createServicesTool,
    createTasksTool,
    updateContactsTool,
    updateOrganizationsTool,
    updateDealsTool,
    updateServicesTool,
    updateTasksTool,
    updateRecordNotesTool,
    manageRecordLinksTool,
    deleteRecordsTool,
  ],
  workspace: [getWorkspaceContextTool, listUsersTool],
  messaging: [
    getMessagingThreadsTool,
    getActivitiesTool,
    getCalendarsTool,
    sendChatMessageTool,
    sendEmailTool,
    saveMessageDraftTool,
    discardMessageDraftTool,
    updateMessagingThreadTool,
    connectMessagingAccountTool,
  ],
  social: [
    getSocialPostsTool,
    getSocialPostEngagementTool,
    getSocialProfileTool,
    manageSocialRelationsTool,
    searchSalesLeadsTool,
    searchSalesCompaniesTool,
    getSalesSearchParametersTool,
    manageSalesListsTool,
  ],
  docs: [searchDocsTool, getDocsPageTool],
  "custom-columns": [manageCustomColumnsTool],
  widgets: [manageWidgetsTool],
  webhooks: [manageWebhooksTool],
  admin: [updateWorkspaceSettingsTool, manageTeamTool],
  support: [requestSupportTool],
};

export const MCP_ALWAYS_ON_TOOLS: McpTool[] = [searchTool, fetchTool];

export const MCP_TOOL_COUNT: number = new Set(
  [...Object.values(MCP_TOOL_GROUPS).flat(), ...MCP_ALWAYS_ON_TOOLS].map((tool) => tool.name),
).size;
