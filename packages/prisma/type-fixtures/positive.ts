import { defineIndex } from "@siftlite/core";
import { createPrismaSearch, type PrismaClientLike } from "../src/index.ts";

const index = defineIndex({
  name: "products",
  mode: "linked",
  source: { table: "products", primaryKey: { field: "id", type: "string" } },
  searchable: { name: { weight: 1 } },
});

declare const prisma: PrismaClientLike;
declare const adapter: import("@siftlite/core").SqlAdapter;

export const productSearch = createPrismaSearch<{ id: string; name: string }>({
  prisma,
  adapter,
  model: "product",
  index,
});

type Expect<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;
export type _model = Expect<Extends<(typeof productSearch)["model"], string>>;
export const _definition = productSearch.definition;
