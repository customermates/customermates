"use client";

import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Props = {
  countryKey: string;
  label: string;
  size?: "sm" | "md";
};

export function FormAutocompleteCountryItem({ countryKey, label, size = "md" }: Props) {
  const t = useTranslations();

  return (
    <div className="flex w-full gap-2 items-center justify-start">
      <Avatar className={size === "sm" ? "size-3" : "size-5"}>
        <AvatarImage
          alt={t("Common.imageAlt.countryFlag", { country: label })}
          src={`/icons/flags/w40/${countryKey.toLowerCase()}.png`}
        />

        <AvatarFallback>{countryKey.toUpperCase()}</AvatarFallback>
      </Avatar>

      <span className="truncate">{label}</span>
    </div>
  );
}
