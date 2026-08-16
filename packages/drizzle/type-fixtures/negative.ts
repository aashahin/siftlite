import { blob, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { defineDrizzleIndex } from "../src/index.ts";

const messy = sqliteTable("messy", {
  id: text("id").primaryKey(),
  name: text("name"),
  payload: blob("payload"),
  huge: blob("huge", { mode: "bigint" }),
});

export const rejectedBlobId = defineDrizzleIndex(messy, {
  // @ts-expect-error blob identifiers are not portable source IDs
  id: messy.payload,
  searchable: { name: { weight: 1 } },
});

export const rejectedBigintId = defineDrizzleIndex(messy, {
  // @ts-expect-error bigint identifiers are not portable source IDs
  id: messy.huge,
  searchable: { name: { weight: 1 } },
});
