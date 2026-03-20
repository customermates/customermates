import { createOpenAPI } from "fumadocs-openapi/server";
import { createAPIPage } from "fumadocs-openapi/ui";

import { BASE_URL } from "@/constants/env";

const openapi = createOpenAPI({
  input: [`${BASE_URL}/v1/openapi.json`],
});

export const APIPage = createAPIPage(openapi);
