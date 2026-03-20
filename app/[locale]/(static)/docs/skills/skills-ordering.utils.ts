const GROUPS_ORDER = ["lead finding", "lead enrichment"] as const;

type SkillLike = {
  data: {
    group?: string;
    title?: string;
  };
};

export function getSkillsGroupKey(group: string | undefined): string {
  const normalized = group?.trim().toLowerCase();
  return normalized || "other";
}

export function sortSkillGroupEntries<T>(entries: [string, T][]): [string, T][] {
  return [...entries].sort(([groupA], [groupB]) => {
    const indexA = GROUPS_ORDER.indexOf(groupA as (typeof GROUPS_ORDER)[number]);
    const indexB = GROUPS_ORDER.indexOf(groupB as (typeof GROUPS_ORDER)[number]);

    if (indexA === -1 && indexB === -1) return groupA.localeCompare(groupB);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

export function sortSkillsByGroupAndTitle<T extends SkillLike>(skills: T[]): T[] {
  const grouped = skills.reduce<Record<string, T[]>>((acc, skill) => {
    const groupKey = getSkillsGroupKey(skill.data.group);
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(skill);
    return acc;
  }, {});

  return sortSkillGroupEntries(Object.entries(grouped)).flatMap(([, groupSkills]) =>
    [...groupSkills].sort((a, b) => (a.data.title ?? "").localeCompare(b.data.title ?? "")),
  );
}
