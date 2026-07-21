import Image from "@tiptap/extension-image";

export const IMAGE_URL_PATTERN = /^https?:\/\/\S+$/i;

const IMAGE_PATH_PATTERN = /\.(apng|avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)(\?\S*)?$/i;

export function isImageUrl(value: string): boolean {
  const candidate = value.trim();
  return IMAGE_URL_PATTERN.test(candidate) && IMAGE_PATH_PATTERN.test(candidate);
}

export function findPastedImageUrl(clipboard: DataTransfer | null): string | null {
  if (!clipboard) return null;

  const uriList = clipboard
    .getData("text/uri-list")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (uriList && isImageUrl(uriList)) return uriList;

  const plain = clipboard.getData("text/plain").trim();
  if (plain && isImageUrl(plain)) return plain;

  return null;
}

export const ImageWithLinkFallback = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const src = (node.attrs.src as string) || "";
      const alt = (node.attrs.alt as string) || "";
      const title = (node.attrs.title as string) || "";

      const dom = document.createElement("span");
      dom.className = "editor-image";

      const image = document.createElement("img");
      image.src = src;
      if (alt) image.alt = alt;
      if (title) image.title = title;

      image.addEventListener("error", () => {
        const fallback = document.createElement("a");
        fallback.className = "editor-image-fallback";
        fallback.href = src;
        fallback.rel = "noreferrer noopener";
        fallback.target = "_blank";
        fallback.textContent = alt || src;
        dom.replaceChildren(fallback);
      });

      dom.appendChild(image);

      return { dom };
    };
  },
});
