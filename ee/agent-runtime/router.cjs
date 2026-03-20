const http = require("http");
const httpProxy = require("http-proxy");

const MY_ID = process.env.FLY_MACHINE_ID;
const PORT = 3000;
const UPSTREAM = "http://127.0.0.1:3001";
const STARTING_MESSAGE = "Starting up, retry later";

const proxy = httpProxy.createProxyServer({ target: UPSTREAM, ws: true, xfwd: true });
let gatewayReady = false;

function pollGateway() {
  const req = http.get(UPSTREAM, (res) => {
    res.resume();
    gatewayReady = true;
  });
  req.on("error", () => {
    if (!gatewayReady) setTimeout(pollGateway, 1000);
  });
  req.setTimeout(2000, () => req.destroy());
}
pollGateway();

proxy.on("error", (_err, _req, res) => {
  if (!res.writeHead) return;
  res.writeHead(gatewayReady ? 502 : 503, { "Content-Type": "text/plain" });
  res.end(gatewayReady ? "Bad Gateway" : STARTING_MESSAGE);
});

function getParams(url) {
  try { return new URL(url, "http://x").searchParams; } catch { return null; }
}

function handleReplay(target, res) {
  if (!target || target === MY_ID) return false;
  if (res.writeHead) {
    res.writeHead(200, { "fly-replay": `instance=${target}` });
    res.end();
  } else {
    res.write(`HTTP/1.1 200 OK\r\nfly-replay: instance=${target}\r\n\r\n`);
    res.end();
  }
  return true;
}

function injectTokenAndStrip(req, searchParams) {
  const token = searchParams?.get("token");
  if (token && !req.headers["authorization"]) req.headers["authorization"] = `Bearer ${token}`;
  if (!searchParams?.has("token") || !req.url) return;
  const upstreamUrl = new URL(req.url, "http://x");
  upstreamUrl.searchParams.delete("token");
  req.url = upstreamUrl.pathname + (upstreamUrl.search ? upstreamUrl.search : "");
}

function respondStarting(res) {
  res.writeHead(503, { "Content-Type": "text/plain", "Retry-After": "5" });
  res.end(STARTING_MESSAGE);
}

const server = http.createServer((req, res) => {
  const searchParams = getParams(req.url);
  if (handleReplay(searchParams?.get("machine"), res)) return;

  if (!gatewayReady) {
    respondStarting(res);
    return;
  }

  injectTokenAndStrip(req, searchParams);
  proxy.web(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const searchParams = getParams(req.url);
  if (handleReplay(searchParams?.get("machine"), socket)) return;
  if (!gatewayReady) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.end();
    return;
  }
  injectTokenAndStrip(req, searchParams);
  proxy.ws(req, socket, head);
});

server.listen(PORT);
