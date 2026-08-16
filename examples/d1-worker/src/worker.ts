import { defineIndex } from "@siftlite/core";
import { d1Adapter, d1SessionAdapter, type D1DatabaseLike } from "@siftlite/d1";
import { createIndex, readRegistry, searchFts5Index } from "@siftlite/fts5";

export interface Env {
  readonly DB: D1DatabaseLike;
}

const products = defineIndex({
  name: "products",
  mode: "linked",
  source: { table: "products", primaryKey: { field: "id", type: "string" } },
  searchable: { title: { weight: 1 } },
  filterable: { status: "text", tenant_id: "text" },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const adapter = d1Adapter(env.DB);
    if (url.pathname === "/migrate") {
      await createIndex({ adapter, definition: products });
      return Response.json({ ok: true });
    }
    if (url.pathname === "/search") {
      const entry = await readRegistry(adapter, products.name);
      if (!entry) {
        return Response.json({ error: "index not created" }, { status: 400 });
      }
      const session = env.DB.withSession
        ? d1SessionAdapter(env.DB, request.headers.get("x-d1-bookmark") ?? "first-unconstrained")
        : adapter;
      const result = await searchFts5Index(
        {
          adapter: session,
          definition: products,
          physicalIndexId: entry.physicalIndexId,
          generation: entry.activeGeneration,
        },
        url.searchParams.get("q") ?? "",
      );
      return Response.json(result);
    }
    return new Response("siftlite d1 example", { status: 200 });
  },
};
