"use client";

import { useEffect, useState } from "react";

import { XLink } from "@/components/x-link";

export function GitHubStarButton() {
  const [starCount, setStarCount] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStarCount() {
      try {
        const res = await fetch("https://api.github.com/repos/customermates/customermates", {
          signal: controller.signal,
        });
        const data = (await res.json()) as { stargazers_count?: number };

        if (typeof data.stargazers_count === "number") setStarCount(data.stargazers_count.toLocaleString("en-US"));
      } finally {
        setIsLoading(false);
      }
    }

    void loadStarCount();

    return () => controller.abort();
  }, []);

  return (
    <div className="mb-5 md:mb-6">
      <XLink
        className="inline-flex items-center gap-1 rounded-full border border-default-200/60 bg-content1/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-default-300 hover:bg-content2/90 hover:shadow-md"
        href="https://github.com/customermates/customermates"
        rel="noopener noreferrer"
        target="_blank"
      >
        <svg className="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.3.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>

        <span>Star us</span>

        <div className="flex items-center gap-1 ml-1 mr-0.5 py-0.5 rounded-full text-xs">
          <svg className="w-3 h-3 text-yellow-400 fill-current" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.538 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.363-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 0 0 .951-.69l1.07-3.292Z" />
          </svg>

          {isLoading && <div className="h-3.5 w-8 animate-pulse rounded-sm bg-default-300 dark:bg-default-500" />}

          {!isLoading && starCount && <span className="h-3.5">{starCount}</span>}
        </div>
      </XLink>
    </div>
  );
}
