// Creates the shared INGEST_KEY (or reuses the one in .env.local), sets it on the
// running Convex deployment and saves it to .env.local for the Python scripts.
// Run while `npm run dev` is up.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV = new URL("../.env.local", import.meta.url);
const text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
let key = text.match(/^INGEST_KEY=(.+)$/m)?.[1].trim();
if (!key) {
  key = randomBytes(24).toString("hex");
  writeFileSync(ENV, `${text.replace(/\n?$/, "\n")}INGEST_KEY=${key}\n`, { mode: 0o600 });
  console.log("generated a new INGEST_KEY and saved it to .env.local");
}
execFileSync("npx", ["convex", "env", "set", "INGEST_KEY", key], { stdio: "inherit" });
