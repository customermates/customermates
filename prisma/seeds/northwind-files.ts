import { fixtureId } from "./helpers";
import { type MemberKey, NORTHWIND_STORY_END_MS, northwindDataset } from "./northwind-data";

const DAY = 86_400_000;

export const NORTHWIND_FILE_ID_PREFIX = "4c000000";

export type NorthwindRecordFile = {
  id: string;
  organizationIndex: number;
  name: string;
  mimeType: string;
  content: string;
  uploadedBy: MemberKey;
  uploadedAtMs: number;
};

/** An authored upload time, kept before the story end so no file was uploaded after the newest demo day. */
function uploadedAt(ms: number): number {
  return Math.min(ms, NORTHWIND_STORY_END_MS - DAY);
}

/**
 * The files in the organizations' Documents field: the notes customer success writes for the first two onboarding
 * projects and the security questionnaire sales answered before the first of those deals was won. Small Markdown
 * files, so the database storage driver keeps them in one part and the file index can read them.
 */
export function northwindRecordFiles(): NorthwindRecordFile[] {
  const data = northwindDataset();
  const [first, second] = data.onboardings;
  if (!first || !second) throw new Error("Missing Northwind onboarding projects for the demo files");
  const firstOrganization = data.organizations[first.organizationIndex];
  const secondOrganization = data.organizations[second.organizationIndex];
  const firstDeal = data.deals[first.dealIndex];
  if (!firstOrganization || !secondOrganization || !firstDeal)
    throw new Error("Missing Northwind records for the demo files");

  return [
    {
      id: fixtureId(NORTHWIND_FILE_ID_PREFIX, 1),
      organizationIndex: first.organizationIndex,
      name: "Kickoff notes.md",
      mimeType: "text/markdown",
      content: [
        `# Kickoff notes: ${firstOrganization.name}`,
        "",
        "## Goals",
        "",
        "- Replace the shared dispatch spreadsheet with Northwind Field.",
        "- Plan technician routes a day ahead and send the job details to the technician app.",
        "",
        "## Integrations",
        "",
        "- Import open service orders from the ERP every night.",
        "- Send completed jobs back with working time and material.",
        "",
        "## Next steps",
        "",
        "- Northwind Labs sends the configuration workbook.",
        `- ${firstOrganization.shortName} names two pilot technicians.`,
        "",
      ].join("\n"),
      uploadedBy: first.ownerKey,
      uploadedAtMs: uploadedAt(first.startMs + DAY),
    },
    {
      id: fixtureId(NORTHWIND_FILE_ID_PREFIX, 2),
      organizationIndex: first.organizationIndex,
      name: "Security questionnaire.md",
      mimeType: "text/markdown",
      content: [
        `# Security questionnaire: ${firstOrganization.name}`,
        "",
        "## Hosting and backups",
        "",
        "Northwind Field keeps customer data in an EU data center and makes a backup every day.",
        "",
        "## Access",
        "",
        "Every technician signs in with a personal account. Administrators remove access when someone leaves.",
        "",
        "## Contact",
        "",
        "Questions about this questionnaire go to the Northwind Labs sales team.",
        "",
      ].join("\n"),
      uploadedBy: firstDeal.ownerKey,
      uploadedAtMs: uploadedAt(Math.max(firstDeal.createdAtMs, firstDeal.closeAtMs - 7 * DAY)),
    },
    {
      id: fixtureId(NORTHWIND_FILE_ID_PREFIX, 3),
      organizationIndex: second.organizationIndex,
      name: "Site survey.md",
      mimeType: "text/markdown",
      content: [
        `# Site survey: ${secondOrganization.name}`,
        "",
        "## Depot",
        "",
        "- The service vans park at the main depot overnight.",
        "- Spare parts are booked out at the depot counter.",
        "",
        "## Planning today",
        "",
        "- Dispatch plans the next day by phone and email.",
        "- Urgent jobs are added during the day.",
        "",
        "## Wishes",
        "",
        "- See every van on a map.",
        "- Let technicians close a job with photos on site.",
        "",
      ].join("\n"),
      uploadedBy: second.ownerKey,
      uploadedAtMs: uploadedAt(second.startMs + 3 * DAY),
    },
  ];
}
