import { randomUUID } from "node:crypto";

const localProviderKey = "e2e-local-provider-no-network";
const events = new Map();
const eventPath =
  /^\/v2\/(e2e_local_[a-f0-9-]{36})\/calendars\/(e2e_local_[a-f0-9-]{36})\/events(?:\/(e2e_event_[a-f0-9-]{36})(\/cancel)?)?$/;

function notFound() {
  return Response.json({ type: "errors/resource_not_found", status: 404 }, { status: 404 });
}

function stored(calendarId, id, body, previous = {}) {
  return {
    ...previous,
    object: "CalendarEvent",
    id,
    calendar_id: calendarId,
    title: body.title ?? previous.title ?? "",
    body: body.body ?? previous.body ?? null,
    location: body.location ?? previous.location ?? null,
    is_cancelled: false,
    is_all_day: false,
    attendees: body.attendees ?? previous.attendees ?? [],
    start: body.start ?? previous.start,
    end: body.end ?? previous.end,
    conference: body.conference
      ? { provider: body.conference.provider, url: `https://meet.e2e.invalid/${id}` }
      : (previous.conference ?? null),
    transparency: body.transparency ?? previous.transparency ?? "opaque",
  };
}

async function handle(request, accountId, calendarId, eventId, cancel) {
  const key = `${accountId}:${calendarId}:${eventId}`;
  if (!eventId && request.method === "POST") {
    const body = await request.json();
    if (typeof body.title !== "string" || !body.start || !body.end)
      throw new Error("Local calendar transport accepts timed events with a title only");
    const id = `e2e_event_${randomUUID()}`;
    const event = stored(calendarId, id, body);
    events.set(`${accountId}:${calendarId}:${id}`, event);
    return Response.json(event);
  }
  const current = events.get(key);
  if (!current) return notFound();
  if (cancel && request.method === "POST") {
    events.set(key, { ...current, is_cancelled: true });
    return Response.json({ id: eventId });
  }
  if (cancel) return null;
  if (request.method === "GET") return Response.json(current);
  if (request.method === "PATCH" || request.method === "PUT") {
    const event = stored(calendarId, eventId, await request.json(), current);
    events.set(key, event);
    return Response.json(event);
  }
  if (request.method === "DELETE") {
    events.delete(key);
    return Response.json({ id: eventId });
  }
  return null;
}

export function localCalendarRequest(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://api.unipile.com" || process.env.UNIPILE_API_KEY !== localProviderKey) return null;
  const path = url.pathname.match(eventPath);
  if (!path || url.username || url.password) return null;
  const request = new Request(input, init);
  if (request.headers.get("X-API-KEY") !== localProviderKey) return null;

  return handle(request, path[1], path[2], path[3], Boolean(path[4]));
}
