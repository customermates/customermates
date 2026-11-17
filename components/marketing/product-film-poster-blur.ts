import { getImageProps } from "next/image";

import type { ProductFilmPoster } from "./product-film-assets";

const PRODUCT_FILM_POSTER_BLUR = {
  "/customermates-film-poster-inbox.jpg":
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAOABgDAREAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAwEG/8QAHBAAAwACAwEAAAAAAAAAAAAAAAERAkESITFh/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ANRXMZ0AuLe4BdVqgE1OPwBcfKBQP//Z",
  "/customermates-film-poster-inbox-dark.jpg":
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAOABgDAREAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAQIG/8QAHhAAAQQBBQAAAAAAAAAAAAAAAQACESEDEjFBgcH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AyuMAl03SAIbe/iArgwgcRnV0gl1GEAg//9k=",
} as const satisfies Record<ProductFilmPoster, string>;

export const FILM_POSTER_QUALITY = 90;

export function filmPosterImageProps(src: ProductFilmPoster) {
  return getImageProps({
    alt: "",
    blurDataURL: PRODUCT_FILM_POSTER_BLUR[src],
    height: 1620,
    placeholder: "blur",
    quality: FILM_POSTER_QUALITY,
    sizes: "(min-width: 1216px) 1152px, (min-width: 640px) calc(100vw - 4rem), calc(100vw - 2rem)",
    src,
    width: 2880,
  }).props;
}
