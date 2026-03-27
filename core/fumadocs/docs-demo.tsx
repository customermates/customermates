"use client";

import { useState } from "react";

import { ShowcaseFrame } from "@/components/showcase-frame";

type Props = {
  src: string;
  title: string;
  withHorizontalPadding?: boolean;
};

export function DocsDemo({ src, title, withHorizontalPadding = false }: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <ShowcaseFrame withHorizontalPadding={withHorizontalPadding}>
      <>
        {!loaded && (
          <div className="h-[600px] w-full animate-pulse bg-default-200 dark:bg-default-100 md:h-[700px] lg:h-[750px]" />
        )}

        <iframe
          className={`${loaded ? "" : "pointer-events-none absolute inset-0 opacity-0"} h-[600px] w-full md:h-[700px] lg:h-[750px]`}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          src={src}
          style={{ border: "none" }}
          tabIndex={-1}
          title={title}
          onLoad={() => setLoaded(true)}
        />
      </>
    </ShowcaseFrame>
  );
}
