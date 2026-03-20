export const SKILL_TAGS = [
  "advanced",
  "automation",
  "beginner",
  "email",
  "intermediate",
  "lead-enrichment",
  "lead-finding",
  "native",
  "orthogonal",
  "outreach",
  "phone",
  "research",
  "social",
] as const;

export type SkillTag = (typeof SKILL_TAGS)[number];
