import { manageRolesTool } from "@/features/mcp-tools/role.mcp-tools";
import { manageDataViewsTool } from "@/features/mcp-tools/data-view.mcp-tools";
import { manageTrashTool, readTrashTool } from "@/features/mcp-tools/trash.mcp-tools";
import {
  discoverRecordTypesV2Tool,
  getRecordModelV2Tool,
  configureRecordModelV2Tool,
  readRecentlyDeletedConfigurationTool,
  queryRecordsV2Tool,
  searchRecordsV2Tool,
  resolveRecordIdentifiersV2Tool,
  readRecordV2Tool,
  mutateRecordV2Tool,
  previewRecordDeletionV2Tool,
  queryRecordMeasureV2Tool,
  readRecordOperationV2Tool,
  cancelRecordOperationV2Tool,
  resumeRecordOperationV2Tool,
  manageRecordDetailLayoutV2Tool,
} from "@/features/mcp-tools/record-model.mcp-tools";
import { getDocsPageTool, searchDocsTool } from "@/features/mcp-tools/docs.mcp-tools";
import { getWorkspaceContextTool, listUsersTool } from "@/features/mcp-tools/workspace.mcp-tools";
import { fetchTool, searchTool } from "@/features/mcp-tools/deep-research.mcp-tools";
import { manageTeamTool, updateWorkspaceSettingsTool } from "@/features/mcp-tools/admin.mcp-tools";
import { manageWebhooksTool } from "@/features/mcp-tools/webhook.mcp-tools";
import { manageWidgetsTool } from "@/features/mcp-tools/widget.mcp-tools";
import { manageRoutinesTool } from "@/features/mcp-tools/routine.mcp-tools";
import { requestSupportTool } from "@/features/mcp-tools/support.mcp-tools";
import { manageWikiPagesTool } from "@/features/mcp-tools/wiki.mcp-tools";
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
  moveEmailThreadTool,
  manageConversationRecordsTool,
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

import type { McpTool } from "@/features/mcp-tools/mcp-tool";

export const MCP_TOOL_GROUPS: Record<string, McpTool[]> = {
  records: [
    discoverRecordTypesV2Tool,
    getRecordModelV2Tool,
    queryRecordsV2Tool,
    searchRecordsV2Tool,
    resolveRecordIdentifiersV2Tool,
    readRecordV2Tool,
    mutateRecordV2Tool,
    previewRecordDeletionV2Tool,
    queryRecordMeasureV2Tool,
    readRecordOperationV2Tool,
    readTrashTool,
    manageTrashTool,
  ],
  "record-model": [
    configureRecordModelV2Tool,
    readRecentlyDeletedConfigurationTool,
    cancelRecordOperationV2Tool,
    resumeRecordOperationV2Tool,
  ],
  workspace: [getWorkspaceContextTool, listUsersTool],
  views: [manageDataViewsTool, manageRecordDetailLayoutV2Tool],
  wiki: [manageWikiPagesTool],
  messaging: [
    getMessagingThreadsTool,
    getActivitiesTool,
    getCalendarsTool,
    sendChatMessageTool,
    sendEmailTool,
    saveMessageDraftTool,
    discardMessageDraftTool,
    updateMessagingThreadTool,
    moveEmailThreadTool,
    manageConversationRecordsTool,
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
  widgets: [manageWidgetsTool],
  routines: [manageRoutinesTool],
  webhooks: [manageWebhooksTool],
  admin: [updateWorkspaceSettingsTool, manageTeamTool, manageRolesTool],
  support: [requestSupportTool],
};

export const MCP_ALWAYS_ON_TOOLS: McpTool[] = [searchTool, fetchTool];

export const ALL_MCP_TOOLS = [...Object.values(MCP_TOOL_GROUPS).flat(), ...MCP_ALWAYS_ON_TOOLS];

export function countMcpTools(tools: readonly Pick<McpTool, "name">[] = ALL_MCP_TOOLS): number {
  const names = tools.map((tool) => tool.name);
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);

  if (duplicateNames.length > 0)
    throw new Error(`Duplicate MCP tool names: ${[...new Set(duplicateNames)].join(", ")}`);

  return names.length;
}

export const MCP_TOOL_COUNT = countMcpTools();
export const MCP_GROUPED_TOOL_COUNT = Object.values(MCP_TOOL_GROUPS).flat().length;
export const MCP_TOOLSET_COUNT = Object.keys(MCP_TOOL_GROUPS).length;
