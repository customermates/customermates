type DocWithOpenApi = {
  data: {
    _openapi?: unknown;
  };
};

export function getDocMethod(doc: DocWithOpenApi): string | undefined {
  const openApi = doc.data._openapi;
  const isWebhook =
    openApi && typeof openApi === "object" && openApi !== null && "webhook" in openApi && openApi.webhook === true;

  const methodValue = isWebhook
    ? "webhook"
    : openApi &&
        typeof openApi === "object" &&
        openApi !== null &&
        "method" in openApi &&
        typeof openApi.method === "string"
      ? openApi.method
      : undefined;

  return methodValue?.toUpperCase();
}

export function getDocMethodColor(method: string | undefined) {
  switch (method?.toUpperCase()) {
    case "GET":
      return "success";
    case "POST":
      return "default";
    case "PUT":
    case "PATCH":
      return "warning";
    case "DELETE":
      return "destructive";
    default:
      return "secondary";
  }
}
