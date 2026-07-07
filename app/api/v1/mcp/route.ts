import {
  getRecordSchemaTool,
  listRecordsTool,
  searchRecordsTool,
  getRecordsTool,
  updateRecordNotesTool,
  manageRecordLinksTool,
  deleteRecordsTool,
} from "@/features/mcp-tools/entity-generic.mcp-tools";
import { createContactsTool, updateContactsTool } from "@/features/mcp-tools/contact.mcp-tools";
import { createOrganizationsTool, updateOrganizationsTool } from "@/features/mcp-tools/organization.mcp-tools";
import { createDealsTool, updateDealsTool } from "@/features/mcp-tools/deal.mcp-tools";
import { createServicesTool, updateServicesTool } from "@/features/mcp-tools/service.mcp-tools";
import { createTasksTool, updateTasksTool } from "@/features/mcp-tools/task.mcp-tools";
import { getWorkspaceContextTool, listUsersTool } from "@/features/mcp-tools/workspace.mcp-tools";
import {
  getMessagingThreadsTool,
  getActivitiesTool,
  sendChatMessageTool,
  sendEmailTool,
  saveMessageDraftTool,
  discardMessageDraftTool,
  updateMessagingThreadTool,
} from "@/features/mcp-tools/messaging.mcp-tools";
import {
  getSocialPostsTool,
  getSocialPostEngagementTool,
  getSocialProfileTool,
  manageSocialRelationsTool,
} from "@/features/mcp-tools/social-posts.mcp-tools";
import { searchDocsTool, getDocsPageTool } from "@/features/mcp-tools/docs.mcp-tools";
import { searchTool, fetchTool } from "@/features/mcp-tools/deep-research.mcp-tools";
import { manageCustomColumnsTool } from "@/features/mcp-tools/custom-column.mcp-tools";
import { manageWidgetsTool } from "@/features/mcp-tools/widget.mcp-tools";
import { manageWebhooksTool } from "@/features/mcp-tools/webhook.mcp-tools";
import { updateWorkspaceSettingsTool, manageTeamTool } from "@/features/mcp-tools/admin.mcp-tools";

import { createMcpRoute, type McpTool } from "./mcp-route-utils";

const TOOL_GROUPS: Record<string, McpTool[]> = {
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
    sendChatMessageTool,
    sendEmailTool,
    saveMessageDraftTool,
    discardMessageDraftTool,
    updateMessagingThreadTool,
  ],
  social: [getSocialPostsTool, getSocialPostEngagementTool, getSocialProfileTool, manageSocialRelationsTool],
  docs: [searchDocsTool, getDocsPageTool],
  "custom-columns": [manageCustomColumnsTool],
  widgets: [manageWidgetsTool],
  webhooks: [manageWebhooksTool],
  admin: [updateWorkspaceSettingsTool, manageTeamTool],
};

const ALWAYS_ON: McpTool[] = [searchTool, fetchTool];

export const maxDuration = 60;

const handler = createMcpRoute(TOOL_GROUPS, ALWAYS_ON, "/api/v1/mcp");

export { handler as GET, handler as POST, handler as DELETE };
