import { getLocale, getTranslations } from "next-intl/server";

import { HomepageViewportVideo } from "@/app/[locale]/(static)/components/homepage-viewport-video";

import { productFilmFor } from "./product-film-assets";
import { filmPosterImageProps } from "./product-film-poster-blur";

export async function ProductFilm() {
  const [t, locale] = await Promise.all([getTranslations("ProductFilm"), getLocale()]);
  const film = productFilmFor(locale);
  const posters = [
    { className: "dark:hidden", src: film.posters.light, theme: "light" as const },
    { className: "not-dark:hidden", src: film.posters.dark, theme: "dark" as const },
  ].map((poster) => ({
    ...poster,
    props: filmPosterImageProps(poster.src),
  }));

  return (
    <section data-product-film aria-label={t("title")} className="w-full px-4 sm:px-8" id="film">
      <div className="homepage-film-frame mx-auto max-w-[72rem]">
        <div className="homepage-film">
          <div className="relative aspect-video w-full">
            {posters.map(({ className, props, theme }) => (
              // eslint-disable-next-line @next/next/no-img-element -- getImageProps keeps next/image optimization
              <img
                key={theme}
                {...props}
                aria-hidden
                alt=""
                className={`absolute inset-0 size-full object-cover ${className}`}
                data-product-film-poster={theme}
                decoding="async"
                fetchPriority="high"
                loading="eager"
              />
            ))}

            <HomepageViewportVideo
              ariaLabel={t("title")}
              className="absolute inset-0 size-full object-cover"
              durationLabel={`${film.seconds} s`}
              playLabel={t("play")}
              src={film.src}
            />
          </div>
        </div>
      </div>

      <p className="mk-caption mx-auto mt-5 max-w-[40rem] text-center">{t("caption")}</p>
    </section>
  );
}
