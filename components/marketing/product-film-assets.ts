const PRODUCT_FILM_POSTERS = {
  dark: "/customermates-film-poster-inbox-dark.jpg",
  light: "/customermates-film-poster-inbox.jpg",
} as const;

export const PRODUCT_FILMS = {
  en: { posters: PRODUCT_FILM_POSTERS, seconds: 73, src: "/customermates-film.mp4" },
  de: { posters: PRODUCT_FILM_POSTERS, seconds: 81, src: "/customermates-film-de.mp4" },
  fr: { posters: PRODUCT_FILM_POSTERS, seconds: 84, src: "/customermates-film-fr.mp4" },
  es: { posters: PRODUCT_FILM_POSTERS, seconds: 80, src: "/customermates-film-es.mp4" },
  it: { posters: PRODUCT_FILM_POSTERS, seconds: 83, src: "/customermates-film-it.mp4" },
} as const;

export type ProductFilmLocale = keyof typeof PRODUCT_FILMS;
export type ProductFilmAssets = (typeof PRODUCT_FILMS)[ProductFilmLocale];
export type ProductFilmPoster = (typeof PRODUCT_FILM_POSTERS)[keyof typeof PRODUCT_FILM_POSTERS];

export const PRODUCT_FILM_PUBLIC_PATHS: readonly string[] = [
  ...Object.values(PRODUCT_FILMS).map((film) => film.src),
  PRODUCT_FILM_POSTERS.light,
  PRODUCT_FILM_POSTERS.dark,
];

function hasFilm(locale: string): locale is ProductFilmLocale {
  return Object.hasOwn(PRODUCT_FILMS, locale);
}

export function productFilmFor(locale: string): ProductFilmAssets {
  return hasFilm(locale) ? PRODUCT_FILMS[locale] : PRODUCT_FILMS.en;
}
