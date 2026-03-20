"use client";

import type { SkillTag } from "@/core/fumadocs/skills-tags";

import { Link } from "@heroui/link";
import { useTranslations } from "next-intl";

import { SourceBadge } from "./source-badge";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XChip } from "@/components/x-chip/x-chip";

type Props = {
  title: string;
  description: string;
  url: string;
  tags: SkillTag[];
  sourceUrl: string;
};

export function SkillCard({ url, title, description, tags, sourceUrl }: Props) {
  const t = useTranslations("SkillTags");

  return (
    <Link className="block min-w-0 w-full h-full" href={url}>
      <XCard isPressable className="h-full min-w-0 w-full">
        <XCardBody>
          <div className="flex flex-col gap-2 min-w-0">
            <h2 className="text-x-md text-left min-w-0 wrap-break-word">{title}</h2>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <XChip key={tag} color="primary" size="sm">
                    {t(tag)}
                  </XChip>
                ))}
              </div>
            )}
          </div>

          <p className="text-x-sm text-subdued my-auto wrap-break-word">{description}</p>

          <SourceBadge
            className="inline-flex items-center gap-1.5 text-xs text-subdued"
            sourceUrl={sourceUrl}
            useAnchor={false}
          />
        </XCardBody>
      </XCard>
    </Link>
  );
}
