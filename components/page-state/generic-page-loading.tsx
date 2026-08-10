import { Spinner } from "@/components/ui/spinner";

type Props = {
  label: string;
};

export function GenericPageLoading({ label }: Props) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center" data-page-loading="generic">
      <Spinner aria-label={label} className="text-muted-foreground" size="lg" />
    </div>
  );
}
