import { ShowcaseFrame } from "@/components/showcase-frame";
import { XImage } from "@/components/x-image";

type Props = {
  alt: string;
  src?: string;
};

export function DocsImage({ alt, src = "docs-placeholder.png" }: Props) {
  return (
    <div className="not-prose my-8">
      <ShowcaseFrame className="mb-0">
        <XImage alt={alt} className="w-full h-auto rounded-none" height={900} src={src} width={1600} />
      </ShowcaseFrame>
    </div>
  );
}
