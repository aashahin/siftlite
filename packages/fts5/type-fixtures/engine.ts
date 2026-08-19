import { defineIndex, type FilterNode, type SearchRequest } from "@siftlite/core";
import type { Fts5IndexHandle, TypedSearchRequest } from "../src/engine.ts";

const products = defineIndex({
  name: "products",
  mode: "manual",
  searchable: { title: { weight: 1 } },
  filterable: { status: "text", tenant_id: "text" },
  sortable: { price: "number" },
  facets: ["price"],
});

type Handle = Fts5IndexHandle<typeof products>;
type SearchArg = NonNullable<Parameters<Handle["search"]>[1]>;
type ScopeArg = Parameters<Handle["scope"]>[0];
type DirectRequest = SearchRequest<"status" | "tenant_id", "title", "price">;

type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Extends<A, B> = A extends B ? true : false;

export type _status_filter = Expect<
  Equal<SearchArg["filter"], FilterNode<"status" | "tenant_id"> | undefined>
>;
export type _scope_keys = Expect<Equal<keyof ScopeArg, "status" | "tenant_id">>;
export type _highlight = Expect<Equal<NonNullable<SearchArg["highlight"]>[number], "title">>;
export type _facets = Expect<
  Equal<NonNullable<SearchArg["facets"]>[number], "status" | "tenant_id" | "price">
>;
export type _sortable_only_facet_on_typed_request = Expect<
  Extends<{ readonly facets: readonly ["price"] }, TypedSearchRequest<typeof products>>
>;
export type _sortable_only_facet_on_search_request = Expect<
  Extends<{ readonly facets: readonly ["price"] }, DirectRequest>
>;

const _sortableOnlyFacet: SearchArg = { facets: ["price"] };
const _directSortableOnlyFacet: DirectRequest = { facets: ["price"] };

const _keep: Handle | typeof products | undefined = undefined;
void _keep;
void _sortableOnlyFacet;
void _directSortableOnlyFacet;
