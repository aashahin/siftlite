import { defineIndex, type FilterNode } from "@siftlite/core";
import type { Fts5IndexHandle } from "../src/engine.ts";

const products = defineIndex({
  name: "products",
  mode: "manual",
  searchable: { title: { weight: 1 } },
  filterable: { status: "text", tenant_id: "text" },
  sortable: { price: "number" },
});

type Handle = Fts5IndexHandle<typeof products>;
type SearchArg = NonNullable<Parameters<Handle["search"]>[1]>;
type ScopeArg = Parameters<Handle["scope"]>[0];

type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type _status_filter = Expect<
  Equal<SearchArg["filter"], FilterNode<"status" | "tenant_id"> | undefined>
>;
export type _scope_keys = Expect<Equal<keyof ScopeArg, "status" | "tenant_id">>;
export type _highlight = Expect<Equal<NonNullable<SearchArg["highlight"]>[number], "title">>;

const _keep: Handle | typeof products | undefined = undefined;
void _keep;
