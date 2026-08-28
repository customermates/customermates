import { AppImage } from "@/components/shared/app-image";

export function BlogHeroMedia({ alt, slug }: { alt: string; slug: string }) {
  return (
    <figure className="mt-10 overflow-hidden rounded-xl bg-sidebar sm:mt-12">
      <AppImage
        isLocalized
        alt={alt}
        className="h-auto w-full"
        height={1080}
        loading="eager"
        sizes="(min-width: 1280px) 1216px, (min-width: 640px) calc(100vw - 4rem), calc(100vw - 2.5rem)"
        src={`${slug}.png`}
        width={1920}
      />
    </figure>
  );
}
