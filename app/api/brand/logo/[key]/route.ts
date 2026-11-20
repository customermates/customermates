import { handleError } from "@/core/api/structured-interactor-handler";
import { getReadWorkspaceBrandLogoInteractor } from "@/core/di";

export const dynamic = "force-dynamic";

const NOT_FOUND_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    const logo = await getReadWorkspaceBrandLogoInteractor().invoke({ key });
    if (!logo) return new Response(null, { status: 404, headers: NOT_FOUND_HEADERS });

    return new Response(logo.bytes, {
      headers: {
        "Content-Type": logo.type,
        "Content-Length": String(logo.bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
