import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import {
  getDownloadRecordFileByGrantInteractor,
  getDownloadRecordFileInteractor,
  getUploadRecordFileContentByGrantInteractor,
  getUploadRecordFileContentInteractor,
} from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const token = request.nextUrl.searchParams.get("token");
    const input = {
      fileId,
      range: request.headers.get("range"),
      download: request.nextUrl.searchParams.get("download") === "1",
    };
    const result = token
      ? await getDownloadRecordFileByGrantInteractor().invoke({ ...input, token })
      : await getDownloadRecordFileInteractor().invoke(input);
    if (!result.ok) return interactorFailureResponse(result.error);
    return new NextResponse(result.data.body, { status: result.data.status, headers: result.data.headers });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const token = request.nextUrl.searchParams.get("token");
    const body = request.body;
    const result = token
      ? await getUploadRecordFileContentByGrantInteractor().invoke({ fileId, token, body })
      : await getUploadRecordFileContentInteractor().invoke({ fileId, body });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
