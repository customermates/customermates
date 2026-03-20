"use client";

import type { SkillTag } from "@/core/fumadocs/skills-tags";

import { useMemo, useState } from "react";
import { Input } from "@heroui/input";
import { useTranslations } from "next-intl";

import { SkillCard } from "./skill-card";

type SkillOverviewItem = {
  description: string;
  sourceUrl: string;
  tags: SkillTag[];
  title: string;
  url: string;
};

type Props = {
  skills: SkillOverviewItem[];
};

export function SkillsOverviewClient({ skills }: Props) {
  const t = useTranslations("SkillsPage");
  const tTag = useTranslations("SkillTags");
  const [query, setQuery] = useState("");

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return skills;

    return skills.filter((skill) => {
      const searchable = [
        skill.title,
        skill.description,
        skill.sourceUrl,
        ...skill.tags,
        ...skill.tags.map((tag) => tTag(tag).toLowerCase()),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [query, skills, tTag]);

  return (
    <>
      <div className="pt-6 w-full">
        <Input className="max-w-xl" placeholder={t("searchPlaceholder")} value={query} onValueChange={setQuery} />
      </div>

      <div
        className="grid gap-5 pt-6 w-full"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
        }}
      >
        {filteredSkills.map((skill) => (
          <div key={skill.url} className="min-w-0">
            <SkillCard
              description={skill.description}
              sourceUrl={skill.sourceUrl}
              tags={skill.tags}
              title={skill.title}
              url={skill.url}
            />
          </div>
        ))}
      </div>

      {filteredSkills.length === 0 && <p className="text-subdued pt-6">{t("searchEmpty")}</p>}
    </>
  );
}
