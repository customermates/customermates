"use client";

import { useState } from "react";

import { ShowcaseFrame } from "@/components/showcase-frame";
import { XImage } from "@/components/x-image";

type Props = {
  alt: string;
  src?: string;
};

export function DocsImage({ alt, src = "docs-placeholder.png" }: Props) {
  const [imageSrc, setImageSrc] = useState(src);

  return (
    <div className="not-prose my-8">
      <ShowcaseFrame className="mb-0" withGlow={false}>
        <XImage
          alt={alt}
          className="w-full h-auto rounded-none"
          height={900}
          src={imageSrc}
          width={1600}
          onError={() => setImageSrc("docs-custom-columns-values.png")}
        />
      </ShowcaseFrame>
    </div>
  );
}
