"use client";

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { XIcon } from "@/components/x-icon";

type Props = {
  value: string | boolean;
};

export function XComparisonCell({ value }: Props) {
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-center px-6">
        <XIcon
          className={`h-5 w-5 mx-auto ${value ? "text-primary-600 dark:text-primary-400" : "text-default-500 dark:text-default-400"}`}
          icon={value ? CheckIcon : XMarkIcon}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center px-6">
      <span className="text-x-sm text-center block">{value}</span>
    </div>
  );
}
