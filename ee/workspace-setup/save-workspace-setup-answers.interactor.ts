import type { Validated } from "@/core/validation/validation.utils";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { SaveWorkspaceSetupAnswersData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { SetupAnswersSchema } from "@/features/workspace-setup/setup-answers.schema";
import { touchAnswer } from "@/features/workspace-setup/setup-prefill";

import { SaveWorkspaceSetupAnswersSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";
import { followUpAnswerIssue } from "./workspace-setup-wire";

const EDITABLE = new Set(["interview", "planned"]);

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class SaveWorkspaceSetupAnswersInteractor extends AuthenticatedInteractor<
  SaveWorkspaceSetupAnswersData,
  { answers: SetupAnswers }
> {
  constructor(private repo: WorkspaceSetupRepo) {
    super();
  }

  @Write({ input: SaveWorkspaceSetupAnswersSchema, tx: false })
  async invoke(data: SaveWorkspaceSetupAnswersData): Validated<{ answers: SetupAnswers }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const setup = await this.repo.get(data.setupId);
    if (!setup) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    const cleared = new Set(Object.entries(data.answers).flatMap(([part, value]) => (value === null ? [part] : [])));
    let answers: SetupAnswers = Object.fromEntries(
      Object.entries(setup.answers).filter(([part]) => !cleared.has(part)),
    );
    for (const [part, value] of Object.entries(data.answers)) if (value) answers = touchAnswer(answers, part, value);
    const parsed = SetupAnswersSchema.safeParse(answers);
    if (!parsed.success)
      return fail(CustomErrorCode.workspaceSetupAnswerInvalid, ["answers", ...parsed.error.issues[0].path.map(String)]);
    for (const [index, answer] of data.followUpAnswers.entries()) {
      const question = setup.interview.followUpQuestions.find((candidate) => candidate.id === answer.id);
      if (!question || followUpAnswerIssue(question, answer.value))
        return fail(CustomErrorCode.workspaceSetupAnswerInvalid, ["followUpAnswers", index]);
    }
    const saved = await this.repo.mutate(data.setupId, (current) => {
      if (!EDITABLE.has(current.status)) return null;
      const followUpAnswers = [
        ...current.interview.followUpAnswers.filter(
          (answer) => !data.followUpAnswers.some((next) => next.id === answer.id),
        ),
        ...data.followUpAnswers,
      ];
      return { status: "interview", answers: parsed.data, interview: { ...current.interview, followUpAnswers } };
    });
    if (!saved?.changed) return failConflict(CustomErrorCode.workspaceSetupConflict);
    return { ok: true, data: { answers: saved.setup.answers } };
  }
}
