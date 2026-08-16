/**
 * Optional remote libSQL/Turso smoke. Skips cleanly when credentials are absent.
 */
const url = process.env["SIFTLITE_LIBSQL_URL"];
const token = process.env["SIFTLITE_LIBSQL_TOKEN"];

if (!url || !token) {
  console.log("skip remote libSQL smoke: credentials not configured");
  process.exit(0);
}

const { createClient } = await import("@libsql/client");
const client = createClient({ url, authToken: token });
const result = await client.execute("SELECT 1 AS ok");
const ok = result.rows[0]?.["ok"];
if (ok !== 1 && ok !== 1n) {
  console.error("remote libSQL smoke failed: unexpected SELECT 1 result");
  process.exit(1);
}
console.log("remote libSQL smoke: query succeeded");
