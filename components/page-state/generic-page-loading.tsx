import { Spinner } from "@/components/ui/spinner";

type Props = {
  label: string;
};

export function GenericPageLoading({ label }: Props) {
  return (
    <div
      className="animate-page-loading-in flex min-h-0 w-full flex-1 items-center justify-center motion-reduce:animate-none"
      data-page-loading="generic"
    >
      <Spinner aria-label={label} className="text-muted-foreground opacity-70" size="lg" />
    </div>
  );
}
