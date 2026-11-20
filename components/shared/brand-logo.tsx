import { cn } from "@/core/utils/cn";

export function BrandLogo({ src, name, className }: { src: string; name: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={name}
      className={cn("max-h-8 w-auto max-w-40 shrink-0 rounded-md object-contain", className)}
      data-brand-logo=""
      decoding="async"
      src={src}
    />
  );
}
