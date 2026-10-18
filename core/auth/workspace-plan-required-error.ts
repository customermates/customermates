import { ForbiddenError } from "@/core/errors/app-errors";

const WORKSPACE_PLAN_REQUIRED_BRAND = Symbol.for("customermates.workspacePlanRequired");

export const WORKSPACE_PLAN_REQUIRED_MESSAGE =
  "This workspace has no plan yet, so its API keys and MCP connections do not work. A workspace administrator can choose a plan in Customermates.";

export class WorkspacePlanRequiredError extends ForbiddenError {
  constructor() {
    super(WORKSPACE_PLAN_REQUIRED_MESSAGE);
    (this as Record<symbol, unknown>)[WORKSPACE_PLAN_REQUIRED_BRAND] = true;
  }

  static [Symbol.hasInstance](value: unknown): value is WorkspacePlanRequiredError {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[WORKSPACE_PLAN_REQUIRED_BRAND] === true
    );
  }
}
