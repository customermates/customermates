import type { SolutionStageTab } from "./solution-stage-tab";

import { getImageProps } from "next/image";

type Props = {
  alt: string;
  eager?: boolean;
  name: string;
  phonePoster?: SolutionStageTab["phonePoster"];
  poster: SolutionStageTab["poster"];
  sizes: string;
};

const THEMES = [
  { className: "dark:hidden", theme: "light" },
  { className: "not-dark:hidden", theme: "dark" },
] as const;

export const PHONE_STAGE_MEDIA = "(min-width: 40rem)";

export function SolutionStageImage({ alt, eager, name, phonePoster, poster, sizes }: Props) {
  return THEMES.map(({ className, theme }) => {
    const image = poster[theme];
    const { props } = getImageProps({ alt, height: image.height, sizes, src: image.src, width: image.width });
    const phone = phonePoster?.[theme];
    const phoneProps = phone
      ? getImageProps({ alt, height: phone.height, sizes: "19rem", src: phone.src, width: phone.width }).props
      : undefined;
    const shown = phoneProps ?? props;

    return (
      <picture key={theme} className={`block ${className}`}>
        {phoneProps ? (
          <source
            height={image.height}
            media={PHONE_STAGE_MEDIA}
            sizes={props.sizes}
            srcSet={props.srcSet}
            width={image.width}
          />
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps keeps next/image optimization */}
        <img
          {...shown}
          alt={alt}
          className={
            phoneProps
              ? "block h-auto w-full max-sm:aspect-[39/64] max-sm:object-cover max-sm:object-left-top"
              : "block h-auto w-full"
          }
          data-solution-stage-capture={name}
          decoding="async"
          fetchPriority={eager ? "high" : undefined}
          loading={eager ? "eager" : "lazy"}
        />
      </picture>
    );
  });
}
