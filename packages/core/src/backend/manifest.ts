export type PhysicalChangeKind =
  | "runtime-only"
  | "migration-only"
  | "rebuild-required"
  | "unsupported";

export interface PhysicalChange {
  readonly kind: PhysicalChangeKind;
  readonly reasons: readonly string[];
}

export interface PhysicalObject {
  readonly kind: "table" | "virtual-table" | "index" | "trigger";
  readonly name: string;
  readonly columns?: readonly string[];
}

export interface PhysicalSchemaManifest {
  readonly backend: string;
  readonly version: number;
  readonly objects: readonly PhysicalObject[];
  readonly tokenizer?: string;
  readonly prefix?: readonly number[];
  readonly searchable: readonly string[];
  readonly projected: readonly string[];
  readonly weightsQueryTime: boolean;
}

export function classifyPhysicalChange(
  previous: PhysicalSchemaManifest | null,
  next: PhysicalSchemaManifest,
): PhysicalChange {
  if (!previous) {
    return { kind: "rebuild-required", reasons: ["initial-create"] };
  }
  if (previous.backend !== next.backend) {
    return { kind: "unsupported", reasons: ["backend-changed"] };
  }
  const reasons: string[] = [];
  if (previous.tokenizer !== next.tokenizer) {
    reasons.push("tokenizer");
  }
  if (JSON.stringify(previous.searchable) !== JSON.stringify(next.searchable)) {
    reasons.push("searchable-layout");
  }
  if (JSON.stringify(previous.prefix) !== JSON.stringify(next.prefix)) {
    reasons.push("prefix");
  }
  if (reasons.length > 0) {
    return { kind: "rebuild-required", reasons };
  }
  if (JSON.stringify(previous.projected) !== JSON.stringify(next.projected)) {
    return { kind: "migration-only", reasons: ["projected-fields"] };
  }
  return { kind: "runtime-only", reasons: [] };
}
