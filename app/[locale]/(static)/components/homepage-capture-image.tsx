import type { ContentLocale } from "@/i18n/locale-registry";

import { getImageProps } from "next/image";

import { cn } from "@/core/utils/cn";

import { HOMEPAGE_CAPTURES, type HomepageCaptureName, homepageCaptureSrc } from "./homepage-captures";

type Props = {
  alt: string;
  className?: string;
  eager?: boolean;
  locale: ContentLocale;
  mobileName?: HomepageCaptureName;
  mobileSizes?: string;
  name: HomepageCaptureName;
  sizes: string;
};

const THEMES = [
  { className: "dark:hidden", theme: "light" },
  { className: "not-dark:hidden", theme: "dark" },
] as const;

export function HomepageCaptureImage({
  alt,
  className,
  eager,
  locale,
  mobileName,
  mobileSizes = "90vw",
  name,
  sizes,
}: Props) {
  const capture = HOMEPAGE_CAPTURES[name][locale];
  const mobileCapture = mobileName ? HOMEPAGE_CAPTURES[mobileName][locale] : undefined;
  const loading = eager ? "eager" : "lazy";

  return THEMES.map(({ className: themeClassName, theme }) => {
    const { props: desktop } = getImageProps({
      alt,
      height: capture.height,
      sizes,
      src: homepageCaptureSrc(name, locale, theme),
      width: capture.width,
    });

    if (!mobileName || !mobileCapture) {
      return (
        <picture key={theme} className={cn("block", themeClassName)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps keeps next/image optimization */}
          <img
            {...desktop}
            alt={alt}
            className={cn("block h-auto w-full", className)}
            data-homepage-capture={name}
            decoding="async"
            loading={loading}
          />
        </picture>
      );
    }

    const { props: mobile } = getImageProps({
      alt,
      height: mobileCapture.height,
      sizes: mobileSizes,
      src: homepageCaptureSrc(mobileName, locale, theme),
      width: mobileCapture.width,
    });

    return (
      <picture key={theme} className={cn("block", themeClassName)}>
        <source
          height={capture.height}
          media="(min-width: 40rem)"
          sizes={desktop.sizes}
          srcSet={desktop.srcSet}
          width={capture.width}
        />

        {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps keeps next/image optimization */}
        <img
          {...mobile}
          alt={alt}
          className={cn("block h-auto w-full", className)}
          data-homepage-capture={name}
          decoding="async"
          loading={loading}
        />
      </picture>
    );
  });
}
