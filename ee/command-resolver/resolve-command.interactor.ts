import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { AgentUsageService, AgentRetrievalCharge } from "@/ee/agent-chat/agent-usage.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { CommandCatalogRepo } from "@/features/command-palette/command-catalog.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type {
  CommandResolution,
  CommandResolutionOutput,
  ResolvableCommand,
  ResolvableList,
  ResolveCommandInput,
} from "@/features/command-palette/command-resolve";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization, failRateLimit, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { env } from "@/env";
import { SHIPPED_AGENT_MODEL } from "@/ee/agent-chat/model-catalog";
import { generateStructuredObject, structuredCallWorstCaseMicrocents } from "@/ee/agent-chat/structured-model-call";
import { commandAvailable, STATIC_COMMANDS, staticCommand } from "@/components/keyboard/command-registry";
import { commandCatalogScope } from "@/features/command-palette/command-catalog-scope";
import {
  CommandResolutionOutputSchema,
  CommandResolutionSchema,
  commandResolveRequest,
  parseCommandResolution,
  ResolveCommandInputSchema,
} from "@/features/command-palette/command-resolve";
import { liveRecordModel } from "@/features/records/record-model-snapshot";
import { recordFilterableFields } from "@/features/records/record-presentation";
import { getTranslator } from "@/i18n/get-translator";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale-registry";

const UNRESOLVABLE_COMMANDS = new Set(["action.signOut"]);

function resolvableLists(
  model: RecordModel,
  typeIds: readonly string[],
  views: readonly { typeId: string; id: string; name: string }[],
  systemLabels: Record<string, string>,
): ResolvableList[] {
  return typeIds.flatMap((typeId) => {
    const type = model.types.find((candidate) => candidate.id === typeId);
    if (!type) return [];
    const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
    return [
      {
        typeId,
        label: type.label,
        pluralLabel: type.pluralLabel,
        views: views.filter((view) => view.typeId === typeId),
        fields: recordFilterableFields(fields, [], typeId).flatMap((filterable) => {
          const field = fields.find((candidate) => candidate.id === filterable.field);
          if (field?.valueType === "member" || filterable.field === "system:assignedTo") return [];
          const systemLabel = systemLabels[filterable.field];
          if (!field && !systemLabel) return [];
          return [
            {
              key: filterable.field,
              label: field?.label ?? systemLabel,
              valueType: field
                ? field.valueType === "select" && field.multiple
                  ? "multipleChoice"
                  : field.valueType
                : "dateTime",
              operators: filterable.operators,
              options:
                field?.valueType === "select" ? field.options.map(({ id, label }) => ({ id, label })) : undefined,
            },
          ];
        }),
      },
    ];
  });
}

@TenantInteractor()
export class ResolveCommandInteractor extends AuthenticatedInteractor<ResolveCommandInput, CommandResolution> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private catalog: CommandCatalogRepo,
    private usage: AgentUsageService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(ResolveCommandInputSchema)
  @ValidateOutput(CommandResolutionSchema)
  async invoke(input: ResolveCommandInput): Validated<CommandResolution> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;
    const [stored, policy, views] = await Promise.all([
      this.records.getModel(),
      this.policy.load(),
      this.catalog.listRecordViewNames(),
    ]);
    if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
    const model = liveRecordModel(stored);
    const scope = commandCatalogScope(model, policy, views);
    const t = await getTranslator(isAppLocale(input.locale) ? input.locale : DEFAULT_LOCALE);
    const environment = {
      appMode: env.APP_MODE,
      canManageSchema: policy.canManageSchema,
      onListPage: false,
      can: policy.allowedSystem,
    };
    const commands: ResolvableCommand[] = STATIC_COMMANDS.filter(
      (command) => !UNRESOLVABLE_COMMANDS.has(command.id) && commandAvailable(command, environment),
    ).map((command) => {
      const parent = command.parentId ? staticCommand(command.parentId) : undefined;
      const label = t(command.labelKey);
      return { key: `cmd:${command.id}`, label: parent ? `${t(parent.labelKey)} > ${label}` : label };
    });
    const now = new Date();
    const request = commandResolveRequest({
      query: input.query,
      today: now.toISOString().slice(0, 10),
      lists: resolvableLists(model, scope.lists, scope.views, {
        "system:createdAt": t("Common.table.columns.createdAt"),
        "system:updatedAt": t("Common.table.columns.updatedAt"),
      }),
      commands,
    });
    const engine = SHIPPED_AGENT_MODEL;
    const grant = await this.usage.prepareRetrieval(this.user.id, now, "commandResolve");
    const reservation = grant
      ? await this.usage.reserveRetrieval({
          grant,
          worstCaseMicrocents: structuredCallWorstCaseMicrocents(engine, request.system, request.prompt),
          model: engine.modelId,
          now,
        })
      : null;
    if (!reservation) {
      const summary = await this.usage.getUsageSummary(this.user.id, now);
      return summary.blockedReason === "credits_exhausted"
        ? failRateLimit(CustomErrorCode.agentLimitReached)
        : failUnavailable(CustomErrorCode.agentServiceUnavailable);
    }
    let charge: AgentRetrievalCharge | null = {
      model: engine.modelId,
      inputTokens: 0,
      costMicrocents: reservation.reservedMicrocents,
      costSource: "estimated",
    };
    let output: CommandResolutionOutput | null = null;
    try {
      const result = await generateStructuredObject({
        label: "Command resolve",
        model: engine,
        schema: CommandResolutionOutputSchema,
        system: request.system,
        prompt: request.prompt,
      });
      charge = result.charge;
      output = result.output;
    } finally {
      await this.usage.settleRetrieval({ reservation, charge });
    }
    return { ok: true, data: (output && parseCommandResolution(output, request.aliases)) ?? { kind: "none" } };
  }
}
