import { getTranslations } from "next-intl/server";

import { HomepageViewportVideo } from "@/app/[locale]/(static)/components/homepage-viewport-video";

import { filmPosterImageProps } from "./product-film-poster-blur";

export const PRODUCT_FILM_SRC = "/customermates-film.mp4";
export const PRODUCT_FILM_POSTER = "/customermates-film-poster-inbox.jpg";
export const PRODUCT_FILM_POSTER_DARK = "/customermates-film-poster-inbox-dark.jpg";

export async function ProductFilm() {
  const t = await getTranslations("ProductFilm");
  const posters = [
    { className: "dark:hidden", src: PRODUCT_FILM_POSTER, theme: "light" as const },
    { className: "not-dark:hidden", src: PRODUCT_FILM_POSTER_DARK, theme: "dark" as const },
  ].map((poster) => ({
    ...poster,
    props: filmPosterImageProps(poster.src, poster.theme),
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
              playLabel={t("play")}
              src={PRODUCT_FILM_SRC}
            />
          </div>
        </div>
      </div>

      <p className="mk-caption mx-auto mt-5 max-w-[40rem] text-center">{t("caption")}</p>
    </section>
  );
}
