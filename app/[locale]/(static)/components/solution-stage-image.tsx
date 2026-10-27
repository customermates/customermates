import type { SolutionStageTab } from "./solution-stage-tab";

import { getImageProps } from "next/image";

type Props = {
  alt: string;
  eager?: boolean;
  name: string;
  poster: SolutionStageTab["poster"];
  sizes: string;
};

const THEMES = [
  { className: "dark:hidden", theme: "light" },
  { className: "not-dark:hidden", theme: "dark" },
] as const;

export function SolutionStageImage({ alt, eager, name, poster, sizes }: Props) {
  return THEMES.map(({ className, theme }) => {
    const image = poster[theme];
    const { props } = getImageProps({ alt, height: image.height, sizes, src: image.src, width: image.width });

    return (
      <picture key={theme} className={`block ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps keeps next/image optimization */}
        <img
          {...props}
          alt={alt}
          className="block h-auto w-full"
          data-solution-stage-capture={name}
          decoding="async"
          fetchPriority={eager ? "high" : undefined}
          loading={eager ? "eager" : "lazy"}
        />
      </picture>
    );
  });
}
