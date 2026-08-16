import { SearchError, type SourceId } from "@siftlite/core";

export interface PrismaFindManyArgs {
  readonly where: Readonly<Record<string, { readonly in: readonly SourceId[] }>>;
}

export interface PrismaModelDelegateLike<
  TRow extends Record<string, unknown> = Record<string, unknown>,
> {
  findMany(args: PrismaFindManyArgs): Promise<readonly TRow[]> | readonly TRow[];
}

export type PrismaClientLike = Record<string, PrismaModelDelegateLike | unknown>;

export function getPrismaModel(prisma: PrismaClientLike, model: string): PrismaModelDelegateLike {
  const delegate = prisma[model];
  if (
    delegate === null ||
    typeof delegate !== "object" ||
    typeof (delegate as PrismaModelDelegateLike).findMany !== "function"
  ) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: `Prisma client has no findMany delegate for model ${model}`,
      details: { reason: "missing-prisma-model", model },
    });
  }
  return delegate as PrismaModelDelegateLike;
}
