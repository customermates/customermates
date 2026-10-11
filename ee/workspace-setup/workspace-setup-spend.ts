import type { PlatformWorkspacePurpose } from "@/ee/agent-chat/agent-usage.service";

import { AGENT_CREDIT_MICROCENTS } from "@/core/commercial/agent-credits";

export const WORKSPACE_SETUP_PLATFORM_PURPOSE: PlatformWorkspacePurpose = "workspaceSetup";

export const WORKSPACE_SETUP_SPEND_CAP_CREDITS = 150;

export const WORKSPACE_SETUP_SPEND_CAP_MICROCENTS = WORKSPACE_SETUP_SPEND_CAP_CREDITS * AGENT_CREDIT_MICROCENTS;
