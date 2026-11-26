import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { SetupAnswers, SetupAnswerValue } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceMembershipRepo } from "@/features/workspace/workspace-membership.repo";
import type { PlanWorkspaceSetupInteractor } from "./plan-workspace-setup.interactor";
import type { StartWorkspaceSetupInteractor } from "./start-workspace-setup.interactor";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { SetupFollowUpQuestion } from "./workspace-setup.schema";

import { z } from "zod";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization, failConflict, fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { TEAM_SIZES } from "@/features/onboarding-funnel/team-size";
import { SetupAnswersSchema, touchAnswer } from "@/features/workspace-setup/setup-answers.schema";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { setupTeamSize } from "./workspace-setup-inputs";

export const AGENT_SETUP_DESCRIPTION_MAX_LENGTH = 1_000;

export const AGENT_SETUP_DESCRIPTION_QUESTION = "In the owner's own words: what does the business do, and for whom?";

export const AGENT_SETUP_WORK_WITH = ["clients", "customers", "ownWork"] as const;
export const AGENT_SETUP_PURPOSES = [
  "deals",
  "projects",
  "contracts",
  "orders",
  "chats",
  "support",
  "hiring",
  "investors",
  "partners",
  "finances",
  "marketing",
] as const;
export const AGENT_SETUP_PRICING = ["fixedPrice", "timeBased", "subscription", "products", "free"] as const;

const DESCRIPTION_QUESTION: SetupFollowUpQuestion = {
  id: "followUp1",
  label: AGENT_SETUP_DESCRIPTION_QUESTION,
  format: "shortText",
  maxLength: AGENT_SETUP_DESCRIPTION_MAX_LENGTH,
};

const Schema = z
  .object({
    companyId: z.uuid(),
    description: z.string().trim().min(1).max(AGENT_SETUP_DESCRIPTION_MAX_LENGTH),
    locale: z.enum(APP_LOCALES).optional(),
    teamSize: z.enum(TEAM_SIZES).optional(),
    workWith: z.enum(AGENT_SETUP_WORK_WITH).optional(),
    purpose: z.array(z.enum(AGENT_SETUP_PURPOSES)).max(AGENT_SETUP_PURPOSES.length).optional(),
    mainSteps: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    pricing: z.enum(AGENT_SETUP_PRICING).optional(),
    exampleRecords: z.boolean().optional(),
  })
  .strict();
export type StartAgentWorkspaceSetupData = Data<typeof Schema>;

const OutputSchema = z.object({ setupId: z.string(), status: z.literal("planning") });
type StartAgentWorkspaceSetupResult = Data<typeof OutputSchema>;

export function isAgentWorkspaceSetup(questions: readonly SetupFollowUpQuestion[]): boolean {
  return questions.some(
    (question) => question.id === "followUp1" && question.label === AGENT_SETUP_DESCRIPTION_QUESTION,
  );
}

function agentAnswers(data: StartAgentWorkspaceSetupData): Array<[keyof SetupAnswers, SetupAnswerValue]> {
  const teamSize = data.teamSize ? setupTeamSize(data.teamSize) : null;
  const entries: Array<[keyof SetupAnswers, SetupAnswerValue | null]> = [
    ["teamSize", teamSize ? { format: "singleChoice", value: teamSize } : null],
    ["workWith", data.workWith ? { format: "singleChoice", value: data.workWith } : null],
    [
      "purpose",
      data.purpose?.length ? { format: "multipleChoice", values: [...new Set(data.purpose)], custom: [] } : null,
    ],
    [
      "mainSteps",
      data.mainSteps?.length ? { format: "orderedList", items: data.mainSteps.map((label) => ({ label })) } : null,
    ],
    ["pricing", data.pricing ? { format: "singleChoice", value: data.pricing } : null],
    [
      "existingData",
      data.exampleRecords === undefined
        ? null
        : { format: "singleChoice", value: data.exampleRecords ? "sampleData" : "empty" },
    ],
  ];
  return entries.filter((entry): entry is [keyof SetupAnswers, SetupAnswerValue] => entry[1] !== null);
}

@SystemInteractor
export class StartAgentWorkspaceSetupInteractor {
  constructor(
    private readonly authService: Pick<AuthService, "getAccountSession">,
    private readonly memberships: Pick<WorkspaceMembershipRepo, "findMembershipUnscoped">,
    private readonly repo: Pick<WorkspaceSetupRepo, "mutate">,
    private readonly start: Pick<StartWorkspaceSetupInteractor, "invoke">,
    private readonly plan: Pick<PlanWorkspaceSetupInteractor, "invoke">,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: StartAgentWorkspaceSetupData): Validated<StartAgentWorkspaceSetupResult> {
    const session = await this.authService.getAccountSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);
    const owner = await this.memberships.findMembershipUnscoped(session.user.email, data.companyId);
    if (!owner) return failAuthorization(CustomErrorCode.permissionDenied);

    return runWithTenant(owner, () => this.startAsOwner(data));
  }

  private async startAsOwner(data: StartAgentWorkspaceSetupData): Validated<StartAgentWorkspaceSetupResult> {
    const started = await this.start.invoke(data.locale ? { locale: data.locale } : {});
    if (!started.ok) return started;
    const { setupId } = started.data;

    let invalid = false;
    const seeded = await this.repo.mutate(setupId, (setup) => {
      if (setup.status !== "interview") return null;
      let answers = setup.answers;
      for (const [part, value] of agentAnswers(data)) answers = touchAnswer(answers, part, value);
      const parsed = SetupAnswersSchema.safeParse(answers);
      if (!parsed.success) {
        invalid = true;
        return null;
      }
      return {
        answers: parsed.data,
        interview: {
          ...setup.interview,
          followUps: "completed",
          followUpQuestions: [DESCRIPTION_QUESTION],
          followUpAnswers: [{ id: "followUp1", value: { format: "shortText", value: data.description } }],
        },
      };
    });
    if (invalid) return fail(CustomErrorCode.workspaceSetupAnswerInvalid, ["answers"]);
    if (!seeded?.changed) return failConflict(CustomErrorCode.workspaceSetupConflict);

    const planned = await this.plan.invoke({ setupId });
    if (!planned.ok) return planned;
    return { ok: true, data: { setupId, status: "planning" } };
  }
}
