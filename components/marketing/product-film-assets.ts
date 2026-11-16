export const PRODUCT_FILMS = {
  en: {
    posters: { dark: "/customermates-film-poster-dark.jpg", light: "/customermates-film-poster.jpg" },
    seconds: 73,
    src: "/customermates-film.mp4",
  },
  de: {
    posters: { dark: "/customermates-film-de-poster-dark.jpg", light: "/customermates-film-de-poster.jpg" },
    seconds: 81,
    src: "/customermates-film-de.mp4",
  },
} as const;

export type ProductFilmLocale = keyof typeof PRODUCT_FILMS;
export type ProductFilmAssets = (typeof PRODUCT_FILMS)[ProductFilmLocale];
export type ProductFilmPoster = ProductFilmAssets["posters"][keyof ProductFilmAssets["posters"]];

export const PRODUCT_FILM_PUBLIC_PATHS: readonly string[] = Object.values(PRODUCT_FILMS).flatMap((film) => [
  film.src,
  film.posters.light,
  film.posters.dark,
]);

function hasFilm(locale: string): locale is ProductFilmLocale {
  return Object.hasOwn(PRODUCT_FILMS, locale);
}

export function productFilmFor(locale: string): ProductFilmAssets {
  return hasFilm(locale) ? PRODUCT_FILMS[locale] : PRODUCT_FILMS.en;
}
