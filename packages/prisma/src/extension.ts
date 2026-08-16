import type { IndexDefinition, SearchRequest, SqlAdapter } from "@siftlite/core";
import type { PrismaClientLike } from "./client.js";
import { createPrismaSearch } from "./search.js";

export interface SearchExtensionOptions {
  readonly adapter: SqlAdapter;
  readonly models: Readonly<Record<string, IndexDefinition>>;
}

/**
 * Optional Prisma Client Extension wrapper. Ergonomic only — not required
 * for correctness and not used as a write hook.
 */
export function searchExtension(options: SearchExtensionOptions): {
  readonly name: "siftlite-search";
  readonly model: Readonly<
    Record<
      string,
      {
        search(
          this: unknown,
          query: string,
          request?: SearchRequest,
        ): ReturnType<ReturnType<typeof createPrismaSearch>["search"]>;
      }
    >
  >;
} {
  const model: Record<
    string,
    {
      search(
        this: unknown,
        query: string,
        request?: SearchRequest,
      ): ReturnType<ReturnType<typeof createPrismaSearch>["search"]>;
    }
  > = {};
  for (const [name, index] of Object.entries(options.models)) {
    model[name] = {
      search(query, request = {}) {
        const prisma = resolveExtendedClient(this);
        return createPrismaSearch({
          prisma,
          adapter: options.adapter,
          model: name,
          index,
        }).search(query, request);
      },
    };
  }
  return {
    name: "siftlite-search",
    model,
  };
}

function resolveExtendedClient(self: unknown): PrismaClientLike {
  if (self !== null && typeof self === "object" && "client" in self) {
    return (self as { client: PrismaClientLike }).client;
  }
  return self as PrismaClientLike;
}
