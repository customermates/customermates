"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { ShowcaseFrame } from "@/components/showcase-frame";

type Props = {
  withHorizontalPadding?: boolean;
};

export function HomepageDemo({ withHorizontalPadding = true }: Props) {
  const locale = useLocale();
  const [loaded, setLoaded] = useState(false);

  function handleLoad() {
    setLoaded(true);
  }

  return (
    <ShowcaseFrame withHorizontalPadding={withHorizontalPadding}>
      <>
        {!loaded && (
          <div className="w-full h-[600px] md:h-[700px] lg:h-[750px] bg-default-200 dark:bg-default-100 animate-pulse" />
        )}

        <iframe
          className={`${loaded ? "" : "absolute inset-0 opacity-0 pointer-events-none"} w-full h-[600px] md:h-[700px] lg:h-[750px]`}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          src={`https://demo.customermates.com/${locale}`}
          style={{ border: "none" }}
          tabIndex={-1}
          title="Customermates Demo"
          onLoad={handleLoad}
        />
      </>
    </ShowcaseFrame>
  );
}
