/**
 * Supported Prisma surface. Client Extensions are GA from 4.16; v1 tests
 * target the Prisma 6 client/extension contract.
 *
 * This package never requires an FTS model or query hooks.
 */
export const SIFTLITE_PRISMA_SUPPORT = {
  package: "@prisma/client",
  major: 6,
  peerRange: "^6.0.0",
  clientExtensions: "generally-available",
  requiresFtsModel: false,
  requiresQueryHooks: false,
} as const;

export type SiftLitePrismaSupport = typeof SIFTLITE_PRISMA_SUPPORT;
