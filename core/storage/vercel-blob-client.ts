import type { VercelBlobClient } from "./vercel-blob-file-storage.driver";

import { del, get, head, issueSignedToken, list, presignUrl, put } from "@vercel/blob";

export const vercelBlobClient: VercelBlobClient = { issueSignedToken, presignUrl, head, get, del, put, list };
