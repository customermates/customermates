import "dotenv/config";

const baseUrl = process.env.ROUTINES_TICK_URL ?? "http://localhost:4000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  process.stderr.write("CRON_SECRET must be set to tick routines locally.\n");
  process.exit(1);
}

const endpoint = new URL("/api/cron/routines", baseUrl);

let response: Response;
try {
  response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` } });
} catch {
  process.stderr.write(
    `Could not reach ${endpoint}. Start the app first with yarn dev, or point ROUTINES_TICK_URL at it. ` +
      "Routine workflows can only be dispatched from inside the running app.\n",
  );
  process.exit(1);
}

if (!response.ok) {
  process.stderr.write(`${endpoint} answered ${response.status} ${response.statusText}.\n`);
  process.exit(1);
}

process.stdout.write(`${await response.text()}\n`);
process.exit(0);
