const API_KEY_HEADER = "x-api-key";

export function withoutApiKey(request: Request): Request {
  if (!request.headers.has(API_KEY_HEADER)) return request;
  const headers = new Headers(request.headers);
  headers.delete(API_KEY_HEADER);
  return new Request(request.url, { method: request.method, headers });
}

export function publicOAuthMetadata(handler: (request: Request) => Promise<Response>) {
  return (request: Request) => handler(withoutApiKey(request));
}
