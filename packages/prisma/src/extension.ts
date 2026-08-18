import {
  SearchError,
  type IndexDefinition,
  type SearchRequest,
  type SqlAdapter,
} from "@siftlite/core";
import type { PrismaClientLike } from "./client.js";
import { createPrismaSearch } from "./search.js";

export interface SearchExtensionOptions {
  readonly prisma: PrismaClientLike;
  readonly adapter: SqlAdapter;
  readonly models: Readonly<Record<string, IndexDefinition>>;
  /** Prisma model field per model name. SQL still uses source.primaryKey.field. */
  readonly prismaIdFields?: Readonly<Record<string, string>>;
}

/**
 * Optional Prisma Client Extension wrapper. Ergonomic only — not required
 * for correctness and not used as a write hook.
 *
 * Close over the real Prisma client. `$extends` model methods do not receive
 * `{ client }` as `this`.
 */
export function searchExtension(options: SearchExtensionOptions): {
  readonly name: "siftlite-search";
  readonly model: Readonly<
    Record<
      string,
      {
        search(
          query: string,
          request?: SearchRequest,
        ): ReturnType<ReturnType<typeof createPrismaSearch>["search"]>;
      }
    >
  >;
} {
  if (options.prisma === null || typeof options.prisma !== "object") {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "searchExtension requires the Prisma client instance",
      details: { reason: "missing-prisma-client" },
    });
  }
  const { prisma, adapter, models, prismaIdFields } = options;
  const model: Record<
    string,
    {
      search(
        query: string,
        request?: SearchRequest,
      ): ReturnType<ReturnType<typeof createPrismaSearch>["search"]>;
    }
  > = {};
  for (const [name, index] of Object.entries(models)) {
    model[name] = {
      search(query, request = {}) {
        return createPrismaSearch({
          prisma,
          adapter,
          model: name,
          index,
          ...(prismaIdFields?.[name] !== undefined
            ? { prismaIdField: prismaIdFields[name] }
            : {}),
        }).search(query, request);
      },
    };
  }
  return {
    name: "siftlite-search",
    model,
  };
}
