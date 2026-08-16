/**
 * Optional remote D1 smoke. Skips cleanly when credentials are absent.
 * When configured, checks that the target database is reachable via the
 * official Cloudflare API and reports rows-read metadata if a query runs.
 */
const accountId = process.env["SIFTLITE_D1_ACCOUNT_ID"];
const databaseId = process.env["SIFTLITE_D1_DATABASE_ID"];
const token = process.env["CLOUDFLARE_API_TOKEN"];

if (!accountId || !databaseId || !token) {
  console.log("skip remote D1 smoke: credentials not configured");
  process.exit(0);
}

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`,
  { headers: { Authorization: `Bearer ${token}` } },
);
if (!response.ok) {
  console.error(`remote D1 smoke failed: HTTP ${response.status}`);
  process.exit(1);
}
const body = (await response.json()) as { success?: boolean };
if (body.success !== true) {
  console.error("remote D1 smoke failed: API success=false");
  process.exit(1);
}
console.log("remote D1 smoke: database reachable");
