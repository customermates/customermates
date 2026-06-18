"use client";

import { useTranslations } from "next-intl";

import { Avatar, AvatarImage } from "@/components/ui/avatar";

type Props = {
  countryKey: string;
  label: string;
  size?: "sm" | "md";
};

export function FormAutocompleteCountryItem({ countryKey, label, size = "md" }: Props) {
  const t = useTranslations();
  const avatarSizeClass = size === "sm" ? "size-3" : "size-5";

  return (
    <div className="flex w-full gap-2 items-center justify-start">
      <Avatar className={avatarSizeClass}>
        <AvatarImage
          alt={t("Common.imageAlt.countryFlag", { country: label })}
          src={`https://flagcdn.com/${countryKey.toLowerCase()}.svg`}
        />
      </Avatar>

      <span className="truncate">{label}</span>
    </div>
  );
}
