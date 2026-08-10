import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "next-intl";

export default function Loading() {
  const t = useTranslations();

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50">
      <Spinner aria-label={t("Loading.text")} className="text-primary" size="lg" />
    </div>
  );
}
