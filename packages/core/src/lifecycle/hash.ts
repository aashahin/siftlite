import type { PhysicalSchemaManifest } from "../backend/manifest.js";
import { canonicalizeJson } from "../hash/canonical-json.js";
import { sha256Hex } from "../hash/sha256.js";

export function hashPhysicalManifest(manifest: PhysicalSchemaManifest): string {
  return sha256Hex(canonicalizeJson(manifest));
}

export function physicalIndexIdFor(name: string): string {
  return sha256Hex(name).slice(0, 8);
}
