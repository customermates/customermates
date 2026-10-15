"use client";

import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  countryKey: string;
  label: string;
  size?: "sm" | "md";
};

function emojiFlag(countryKey: string): string {
  return String.fromCodePoint(...[...countryKey.toUpperCase()].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));
}

export function FormAutocompleteCountryItem({ countryKey, label, size = "md" }: Props) {
  const t = useTranslations();
  const { appMode } = useRootStore();

  return (
    <div className="flex w-full gap-2 items-center justify-start">
      <Avatar className={size === "sm" ? "size-3" : "size-5"}>
        {appMode === "self-hosted" ? (
          <AvatarFallback aria-hidden className="bg-transparent text-[0.75em]">
            {emojiFlag(countryKey)}
          </AvatarFallback>
        ) : (
          <AvatarImage
            alt={t("Common.imageAlt.countryFlag", { country: label })}
            className="rounded-[inherit] object-cover"
            src={`https://flagcdn.com/${countryKey.toLowerCase()}.svg`}
          />
        )}
      </Avatar>

      <span className="truncate">{label}</span>
    </div>
  );
}
