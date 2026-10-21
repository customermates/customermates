import { interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { getReadCalendarSubscriptionInteractor } from "@/core/di";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const result = await getReadCalendarSubscriptionInteractor().invoke({ token });
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (!result.ok) return interactorFailureResponse(result.error);
  if (result.data === null) return new Response("Calendar subscription no longer available", { status: 410, headers });
  return new Response(result.data, {
    headers: {
      ...headers,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=customermates.ics",
    },
  });
}
