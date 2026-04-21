"use server";

import type { SendContactInquiryData } from "@/features/contact/send-contact-inquiry.schema";

import { getSendContactInquiryInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function sendContactInquiryAction(data: SendContactInquiryData) {
  return serializeResult(getSendContactInquiryInteractor().invoke(data));
}
