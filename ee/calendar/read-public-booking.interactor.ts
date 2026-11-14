import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import type { MeetingRecordService } from "./meeting-record.service";
import type { PublicBookingAccess } from "./public-booking-access";

import { type PublicBookingPageResult, PublicBookingQuerySchema } from "./booking.schema";
import { PUBLIC_BOOKING_UNAVAILABLE } from "./public-booking-access";
import { publicQuestions } from "./public-booking-questions";

@SystemInteractor
export class ReadPublicBookingInteractor {
  constructor(
    private access: PublicBookingAccess,
    private records: Pick<MeetingRecordService, "loadModel">,
  ) {}

  async invoke(input: unknown): Promise<PublicBookingPageResult> {
    const query = PublicBookingQuerySchema.safeParse(input);
    if (!query.success) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.access.open(
      query.data.token,
      query.data.visitor,
      async (link): Promise<PublicBookingPageResult> => ({
        status: "available",
        page: {
          title: link.title,
          description: link.description,
          durationMinutes: link.durationMinutes,
          timeZone: link.timeZone,
          workspaceName: link.workspaceName,
          hostName: link.hostName,
          withVideo: link.withVideo,
          questions: publicQuestions(link.recordTypeId ? await this.records.loadModel() : null, link),
        },
      }),
    );
  }
}
