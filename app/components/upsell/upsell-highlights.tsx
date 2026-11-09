import { Check } from "lucide-react";

type Props = {
  items: readonly string[];
};

export function UpsellHighlights({ items }: Props) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" data-upsell-highlights="">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-foreground">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />

          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
