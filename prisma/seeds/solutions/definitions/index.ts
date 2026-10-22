import type { SolutionId } from "@/core/solutions/solution-catalog";

import type { AnySolutionDefinition } from "../define-solution";
import agencies from "./agencies";
import clientManagement from "./client-management";
import consultants from "./consultants";
import freelancers from "./freelancers";
import linkedinCrm from "./linkedin-crm";
import salesPipeline from "./sales-pipeline";
import smb from "./smb";
import startups from "./startups";
import whatsappCrm from "./whatsapp-crm";

/** Every solution definition by catalog id. */
export const SOLUTION_DEFINITIONS: Record<SolutionId, AnySolutionDefinition> = {
  smb,
  consultants,
  agencies,
  freelancers,
  startups,
  "client-management": clientManagement,
  "sales-pipeline": salesPipeline,
  "linkedin-crm": linkedinCrm,
  "whatsapp-crm": whatsappCrm,
};
