"use client";

import type { ReactNode } from "react";

import { useState } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  label: string;
  labels: string[];
  panels: ReactNode[];
};

export function HomepageWorkspaceTabs({ label, labels, panels }: Props) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div
        aria-label={label}
        className="mx-auto grid max-w-[24rem] grid-cols-2 gap-2 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center"
        role="tablist"
      >
        {labels.map((name, index) => (
          <button
            key={name}
            aria-selected={index === active}
            className={cn("homepage-tab truncate", index === active && "homepage-tab-active")}
            role="tab"
            type="button"
            onClick={() => setActive(index)}
          >
            {name}
          </button>
        ))}
      </div>

      {panels.map((panel, index) => (
        <div key={labels[index]} hidden={index !== active} role="tabpanel">
          {index === active ? panel : null}
        </div>
      ))}
    </div>
  );
}
