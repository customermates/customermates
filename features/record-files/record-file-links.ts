import type { RecordFileGrant, RecordFileGrantPurpose } from "./record-file-grant";

import { recordFileGrantSecret, signRecordFileGrant, verifyRecordFileGrant } from "./record-file-grant";

export class RecordFileLinks {
  constructor(
    private secret: string | undefined,
    private baseUrl: string,
  ) {}

  contentUrl(purpose: RecordFileGrantPurpose, fileId: string, userId: string, expiresAt: Date): string {
    const key = recordFileGrantSecret(this.secret);
    if (!key) throw new Error("BETTER_AUTH_SECRET must be configured to sign file links");
    const url = new URL(`${this.baseUrl}/api/v1/files/${encodeURIComponent(fileId)}/content`);
    url.searchParams.set("token", signRecordFileGrant(key, purpose, fileId, userId, expiresAt));
    return url.toString();
  }

  withUploadGrant(target: string, fileId: string, userId: string, expiresAt: Date): string {
    const key = recordFileGrantSecret(this.secret);
    if (!key) throw new Error("BETTER_AUTH_SECRET must be configured to sign file links");
    const url = new URL(target);
    url.searchParams.set("token", signRecordFileGrant(key, "upload", fileId, userId, expiresAt));
    return url.toString();
  }

  verify(purpose: RecordFileGrantPurpose, fileId: string, token: string): RecordFileGrant {
    const key = recordFileGrantSecret(this.secret);
    return key ? verifyRecordFileGrant(key, purpose, fileId, token) : { status: "invalid" };
  }
}
