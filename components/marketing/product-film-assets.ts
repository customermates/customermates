// The product film exists in English and German. The German pages show the German film (German voice, German
// product screens); every other locale shows the English film (the French, Italian and Spanish captions say so).
// Another language is one entry here, its three files in public/ (the film and the light and dark poster), its
// poster placeholders in product-film-poster-blur.ts and the length in its homepage.mdx film button.
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
