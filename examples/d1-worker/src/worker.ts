import { bindScope, defineIndex, isSearchError } from "@siftlite/core";
import {
  d1Adapter,
  d1SessionAdapter,
  type D1DatabaseLike,
  type D1SessionConstraint,
  type D1SqlAdapter,
} from "@siftlite/d1";
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

function executionAdapter(env: Env, constraintOrBookmark: D1SessionConstraint): D1SqlAdapter {
  return env.DB.withSession ? d1SessionAdapter(env.DB, constraintOrBookmark) : d1Adapter(env.DB);
}

function withBookmark(body: unknown, adapter: D1SqlAdapter, status = 200): Response {
  const bookmark = adapter.getBookmark();
  return Response.json(body, {
    status,
    headers: bookmark ? { "x-d1-bookmark": bookmark } : undefined,
  });
}

export function resolveRequestTenant(request: Request, url: URL): string | undefined {
  return request.headers.get("x-tenant-id") || url.searchParams.get("tenant") || undefined;
}

export function isAlreadyExistsError(error: unknown): boolean {
  return isSearchError(error) && error.details?.["reason"] === "already-exists";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/migrate") {
      // Demo-only. Do not expose unauthenticated DDL in production.
      const adapter = executionAdapter(env, "first-primary");
      try {
        await createIndex({ adapter, definition: products });
      } catch (error) {
        if (!isAlreadyExistsError(error)) {
          throw error;
        }
      }
      return withBookmark({ ok: true }, adapter);
    }
    if (url.pathname === "/search") {
      const adapter = executionAdapter(
        env,
        request.headers.get("x-d1-bookmark") ?? "first-primary",
      );
      const entry = await readRegistry(adapter, products.name);
      if (!entry) {
        return withBookmark({ error: "index not created" }, adapter, 400);
      }
      if (entry.health !== "healthy") {
        return withBookmark({ error: "index is not healthy" }, adapter, 503);
      }
      const tenant = resolveRequestTenant(request, url);
      if (!tenant) {
        return withBookmark({ error: "tenant required" }, adapter, 400);
      }
      const result = await searchFts5Index(
        {
          adapter,
          definition: products,
          physicalIndexId: entry.physicalIndexId,
          generation: entry.activeGeneration,
        },
        url.searchParams.get("q") ?? "",
        { scope: bindScope({ tenant_id: tenant }) },
      );
      return withBookmark(result, adapter);
    }
    return new Response("siftlite d1 example", { status: 200 });
  },
};
