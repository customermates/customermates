import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { getReadCalendarSubscriptionInteractor } from "@/core/di";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const result = await getReadCalendarSubscriptionInteractor().invoke({ token });
    if (!result.ok) {
      const response = interactorFailureResponse(result.error);
      for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
      return response;
    }
    if (result.data === null)
      return new Response("Calendar subscription no longer available", { status: 410, headers: PRIVATE_HEADERS });
    return new Response(result.data, {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=customermates.ics",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
