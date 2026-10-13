import { NotFoundPageView } from "@/components/shared/not-found-page-view";
import { RecordUnavailableBreadcrumb } from "@/components/records/record-unavailable-breadcrumb";

export default function NotFound() {
  return (
    <>
      <RecordUnavailableBreadcrumb kind="missing" />

      <NotFoundPageView />
    </>
  );
}
