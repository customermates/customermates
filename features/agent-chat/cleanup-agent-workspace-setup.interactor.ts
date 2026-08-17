import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import type { GetCompanySettingsInteractor } from "@/features/company/get-company-settings.interactor";
import type { UpdateCompanySettingsInteractor } from "@/features/company/update-company-settings.interactor";
import type { DeleteContactInteractor } from "@/features/contacts/delete/delete-contact.interactor";
import type { DeleteCustomColumnInteractor } from "@/features/custom-column/delete-custom-column.interactor";
import type { DeleteDealInteractor } from "@/features/deals/delete/delete-deal.interactor";
import {
  terminologySelectionsFromOverrides,
  terminologySelectionsToEntries,
} from "@/features/entity-terminology/entity-terminology.constants";
import type { DeleteOrganizationInteractor } from "@/features/organizations/delete/delete-organization.interactor";
import type { DeleteServiceInteractor } from "@/features/services/delete/delete-service.interactor";
import type { DeleteTaskInteractor } from "@/features/tasks/delete/delete-task.interactor";
import type { DeleteWidgetInteractor } from "@/features/widget/delete-widget.interactor";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { AgentWorkspaceSetupCleanupSummarySchema } from "./agent-chat.schema";

import { agentWorkspaceSetupTerminologyEntries } from "./agent-workspace-setup";
import type { AgentWorkspaceSetupCleanupDecision, AgentWorkspaceSetupRepo } from "./agent-workspace-setup.repository";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const CleanupAgentWorkspaceSetupSchema = z.object({
  conversationId: z.uuid(),
  setupId: z.uuid(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  mode: z.enum(["safe", "full"]),
});

export type CleanupAgentWorkspaceSetupData = z.infer<typeof CleanupAgentWorkspaceSetupSchema>;

const CleanupAgentWorkspaceSetupResultSchema = AgentWorkspaceSetupCleanupSummarySchema.extend({
  status: z.enum(["cleaned", "partiallyCleaned"]),
  setupId: z.string(),
});

export type CleanupAgentWorkspaceSetupResult = Data<typeof CleanupAgentWorkspaceSetupResultSchema>;

type CleanupDependencies = {
  chatRepo: PrismaAgentChatRepo;
  setupRepo: AgentWorkspaceSetupRepo;
  getCompanySettings: GetCompanySettingsInteractor;
  updateCompanySettings: UpdateCompanySettingsInteractor;
  deleteWidget: DeleteWidgetInteractor;
  deleteTask: DeleteTaskInteractor;
  deleteDeal: DeleteDealInteractor;
  deleteService: DeleteServiceInteractor;
  deleteContact: DeleteContactInteractor;
  deleteOrganization: DeleteOrganizationInteractor;
  deleteCustomColumn: DeleteCustomColumnInteractor;
};

async function dataOrThrow<T>(resultPromise: Validated<T>): Promise<T> {
  const result = await resultPromise;
  if (!result.ok) throw result.error;
  return result.data;
}

async function deleteResource(deps: CleanupDependencies, decision: AgentWorkspaceSetupCleanupDecision) {
  if (decision.action !== "delete") return;

  switch (decision.kind) {
    case "widget":
      await dataOrThrow(deps.deleteWidget.invoke({ id: decision.resourceId }));
      return;
    case "task":
      await dataOrThrow(deps.deleteTask.invoke({ id: decision.resourceId }));
      return;
    case "deal":
      await dataOrThrow(deps.deleteDeal.invoke({ id: decision.resourceId }));
      return;
    case "service":
      await dataOrThrow(deps.deleteService.invoke({ id: decision.resourceId }));
      return;
    case "contact":
      await dataOrThrow(deps.deleteContact.invoke({ id: decision.resourceId }));
      return;
    case "organization":
      await dataOrThrow(deps.deleteOrganization.invoke({ id: decision.resourceId }));
      return;
    case "customColumn":
      await dataOrThrow(deps.deleteCustomColumn.invoke({ id: decision.resourceId }));
  }
}

const CLEANUP_ORDER = {
  widget: 0,
  task: 1,
  deal: 2,
  service: 3,
  contact: 4,
  organization: 5,
  customColumn: 6,
} as const satisfies Record<AgentWorkspaceSetupCleanupDecision["kind"], number>;

function validateCleanupPlan(
  setup: Awaited<ReturnType<AgentWorkspaceSetupRepo["findAppliedSetupById"]>> & {},
  mode: "safe" | "full",
  decisions: AgentWorkspaceSetupCleanupDecision[],
) {
  const eligible = setup.resources.filter((resource) =>
    mode === "safe" ? resource.status === "active" : resource.status === "retained",
  );
  if (decisions.length !== eligible.length)
    throw new AgentSessionUnavailableError("Workspace setup cleanup plan is incomplete.");

  const resourceByProvenance = new Map(eligible.map((resource) => [resource.provenanceId, resource]));
  const seen = new Set<string>();
  for (const decision of decisions) {
    const resource = resourceByProvenance.get(decision.provenanceId);
    if (
      seen.has(decision.provenanceId) ||
      !resource ||
      resource.kind !== decision.kind ||
      resource.resourceId !== decision.resourceId
    )
      throw new AgentSessionUnavailableError("Workspace setup cleanup plan contains an invalid resource.");
    seen.add(decision.provenanceId);
  }
}

function sameAppliedTerminology(
  current: ReturnType<typeof terminologySelectionsFromOverrides>,
  applied: ReturnType<typeof agentWorkspaceSetupTerminologyEntries>,
) {
  return applied.every((entry) => current[entry.entityType] === entry.presetKey);
}

function existingCleanupSummary(
  setup: NonNullable<Awaited<ReturnType<AgentWorkspaceSetupRepo["findAppliedSetupById"]>>>,
) {
  const retainedReasons = Array.from(
    new Set(
      setup.resources.flatMap((resource) =>
        resource.status === "retained" && resource.cleanupReason ? [resource.cleanupReason] : [],
      ),
    ),
  );
  return {
    deletedResources: setup.resources.filter((resource) => resource.status === "deleted").length,
    retainedResources: setup.resources.filter((resource) => resource.status === "retained").length,
    missingResources: setup.resources.filter((resource) => resource.status === "missing").length,
    retainedReasons,
  };
}

@TenantInteractor({
  permissions: [
    { resource: Resource.company, action: Action.readOwn },
    { resource: Resource.company, action: Action.update },
    { resource: Resource.organizations, action: Action.delete },
    { resource: Resource.contacts, action: Action.delete },
    { resource: Resource.services, action: Action.delete },
    { resource: Resource.deals, action: Action.delete },
    { resource: Resource.tasks, action: Action.delete },
  ],
  condition: "AND",
})
export class CleanupAgentWorkspaceSetupInteractor extends AuthenticatedInteractor<
  CleanupAgentWorkspaceSetupData,
  CleanupAgentWorkspaceSetupResult
> {
  constructor(private deps: CleanupDependencies) {
    super();
  }

  @Write({
    input: CleanupAgentWorkspaceSetupSchema,
    output: CleanupAgentWorkspaceSetupResultSchema,
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: CleanupAgentWorkspaceSetupData): Validated<CleanupAgentWorkspaceSetupResult> {
    const conversation = await this.deps.chatRepo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");

    const setup = await this.deps.setupRepo.findAppliedSetupById({
      conversationId: data.conversationId,
      setupId: data.setupId,
      planHash: data.planHash,
    });
    if (!setup) throw new AgentSessionUnavailableError("Workspace setup not found.");

    if (setup.status === "cleaned" || setup.cleanedAt) {
      return {
        ok: true,
        data: {
          status: "cleaned",
          setupId: setup.id,
          ...existingCleanupSummary(setup),
        },
      };
    }

    if (data.mode === "safe" && setup.status === "partiallyCleaned") {
      return {
        ok: true,
        data: {
          status: "partiallyCleaned",
          setupId: setup.id,
          ...existingCleanupSummary(setup),
        },
      };
    }

    if (data.mode === "safe" && setup.status !== "applied")
      throw new AgentSessionUnavailableError("Safe workspace setup cleanup has already been attempted.");

    const hasEditedRetainedResource = setup.resources.some(
      (resource) => resource.status === "retained" && resource.cleanupReason === "edited",
    );
    if (data.mode === "full" && setup.status === "partiallyCleaned" && !hasEditedRetainedResource) {
      return {
        ok: true,
        data: {
          status: "partiallyCleaned",
          setupId: setup.id,
          ...existingCleanupSummary(setup),
        },
      };
    }
    if (data.mode === "full" && (setup.status !== "partiallyCleaned" || !hasEditedRetainedResource))
      throw new AgentSessionUnavailableError("Full cleanup is only available for edited setup resources kept earlier.");

    const settings = await dataOrThrow(this.deps.getCompanySettings.invoke());
    const currentTerminology = terminologySelectionsFromOverrides(settings.terminology.presets);
    const appliedTerminology = agentWorkspaceSetupTerminologyEntries(setup.plan);
    const shouldRestoreTerminology = sameAppliedTerminology(currentTerminology, appliedTerminology);

    const cleanupPlan = await this.deps.setupRepo.planCleanupOrThrow({
      setupId: setup.id,
      mode: data.mode,
    });

    if (cleanupPlan.setupId !== setup.id)
      throw new AgentSessionUnavailableError("Workspace setup cleanup plan does not match this setup.");
    validateCleanupPlan(setup, data.mode, cleanupPlan.decisions);

    const decisions = cleanupPlan.decisions.toSorted(
      (left, right) => CLEANUP_ORDER[left.kind] - CLEANUP_ORDER[right.kind],
    );
    for (const decision of decisions) await deleteResource(this.deps, decision);

    if (shouldRestoreTerminology) {
      const priorSelections = terminologySelectionsFromOverrides(setup.priorTerminology);
      const restored = await this.deps.updateCompanySettings.invoke({
        terminology: terminologySelectionsToEntries(priorSelections),
      });
      if (!restored.ok) throw restored.error;
    }

    await this.deps.setupRepo.recordCleanupResultOrThrow({
      setupId: setup.id,
      decisions,
      completedAt: new Date(),
    });

    const deletedResources = decisions.filter((item) => item.action === "delete").length;
    const retainedResources = decisions.filter((item) => item.action === "retain").length;
    const missingResources = decisions.filter((item) => item.action === "missing").length;

    const retainedReasons = Array.from(
      new Set(decisions.flatMap((item) => (item.action === "retain" && item.reason ? [item.reason] : []))),
    );

    return {
      ok: true,
      data: {
        status: retainedResources === 0 ? "cleaned" : "partiallyCleaned",
        setupId: setup.id,
        deletedResources,
        retainedResources,
        missingResources,
        retainedReasons,
      },
    };
  }
}
