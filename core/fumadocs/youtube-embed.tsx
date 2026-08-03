"use client";

import { useState } from "react";
import { PlayIcon } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  id: string;
  title?: string;
};

export function YouTube({ id, title = "YouTube video" }: Props) {
  const t = useTranslations();
  const [isActivated, setIsActivated] = useState(false);

  return (
    <div className="relative w-full my-6 rounded-xl overflow-hidden bg-muted" style={{ paddingBottom: "56.25%" }}>
      {isActivated ? (
        <iframe
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="absolute inset-0 size-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={title}
        />
      ) : (
        <button
          className="absolute inset-0 size-full flex flex-col items-center justify-center gap-3 p-6 text-center transition-colors hover:bg-muted/70"
          type="button"
          onClick={() => setIsActivated(true)}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-foreground/10">
            <PlayIcon className="size-6" />
          </span>

          <span className="font-medium">{title}</span>

          <span className="text-subdued text-x-sm max-w-md">{t("VideoEmbed.consentNotice")}</span>
        </button>
      )}
    </div>
  );
}
