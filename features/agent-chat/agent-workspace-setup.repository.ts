import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";

import type { AgentWorkspaceSetupPlan } from "./agent-workspace-setup";

export const AGENT_SETUP_RESOURCE_KINDS = [
  "customColumn",
  "organization",
  "contact",
  "service",
  "deal",
  "task",
  "widget",
] as const;

export type AgentSetupResourceKind = (typeof AGENT_SETUP_RESOURCE_KINDS)[number];

export type AgentSetupResourceReference = {
  kind: AgentSetupResourceKind;
  resourceId: string;
};

export type AppliedAgentSetupResource = AgentSetupResourceReference & {
  provenanceId: string;
  initialUpdatedAt: Date;
  status: "active" | "retained" | "deleted" | "missing";
  cleanupReason: "edited" | "dependent" | null;
};

export type AppliedAgentWorkspaceSetup = {
  id: string;
  conversationId: string;
  reviewMessageId: string;
  commandId: string;
  plan: AgentWorkspaceSetupPlan;
  planHash: string;
  priorTerminology: EntityTerminologyOverride[];
  status: "applied" | "partiallyCleaned" | "cleaned";
  resources: AppliedAgentSetupResource[];
  appliedAt: Date;
  cleanedAt: Date | null;
};

export type AgentWorkspaceSetupCleanupDecision =
  | {
      provenanceId: string;
      kind: AgentSetupResourceKind;
      resourceId: string;
      action: "delete";
      reason: null;
    }
  | {
      provenanceId: string;
      kind: AgentSetupResourceKind;
      resourceId: string;
      action: "retain";
      reason: "edited" | "dependent";
    }
  | {
      provenanceId: string;
      kind: AgentSetupResourceKind;
      resourceId: string;
      action: "missing";
      reason: null;
    };

export type AgentWorkspaceSetupCleanupPlan = {
  setupId: string;
  decisions: AgentWorkspaceSetupCleanupDecision[];
};

export type AgentWorkspaceSetupCleanupSummary = {
  deletedResources: number;
  retainedResources: number;
  missingResources: number;
  retainedReasons: ("edited" | "dependent")[];
};

export type AgentWorkspaceSetupConversationState = {
  setupId: string;
  reviewMessageId: string;
  commandId: string;
  planHash: string;
  status: "applied" | "partiallyCleaned" | "cleaned";
  cleanupSummary: AgentWorkspaceSetupCleanupSummary | null;
};

export abstract class AgentWorkspaceSetupRepo {
  abstract findAppliedSetupByReview(args: {
    conversationId: string;
    reviewMessageId: string;
    commandId: string;
    planHash: string;
  }): Promise<AppliedAgentWorkspaceSetup | null>;

  abstract findAppliedSetupById(args: {
    conversationId: string;
    setupId: string;
    planHash: string;
  }): Promise<AppliedAgentWorkspaceSetup | null>;

  abstract listConversationSetupStates(conversationId: string): Promise<AgentWorkspaceSetupConversationState[]>;

  abstract recordAppliedSetup(args: {
    conversationId: string;
    reviewMessageId: string;
    commandId: string;
    plan: AgentWorkspaceSetupPlan;
    planHash: string;
    priorTerminology: EntityTerminologyOverride[];
    resources: AgentSetupResourceReference[];
  }): Promise<AppliedAgentWorkspaceSetup>;

  abstract planCleanupOrThrow(args: {
    setupId: string;
    mode: "safe" | "full";
  }): Promise<AgentWorkspaceSetupCleanupPlan>;

  abstract recordCleanupResultOrThrow(args: {
    setupId: string;
    decisions: AgentWorkspaceSetupCleanupDecision[];
    completedAt: Date;
  }): Promise<void>;
}
