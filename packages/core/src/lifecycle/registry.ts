export const REGISTRY_TABLE = "__sift_registry";

export type RegistryHealth = "healthy" | "pending";

export interface RegistryRow {
  readonly indexName: string;
  readonly physicalIndexId: string;
  readonly activeGeneration: number;
  readonly definitionHash: string;
  readonly physicalSchemaVersion: number;
  readonly physicalSchemaHash: string;
  readonly backend: string;
  readonly sourceTable: string | null;
  readonly mode: "linked" | "manual";
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly health: RegistryHealth;
}

export interface DoctorFinding {
  readonly severity: "info" | "warn" | "error";
  readonly code: string;
  readonly message: string;
}

export interface DoctorReport {
  readonly healthy: boolean;
  readonly findings: readonly DoctorFinding[];
  readonly registry: RegistryRow | null;
}

export interface CheckReport {
  readonly ok: boolean;
  readonly findings: readonly DoctorFinding[];
}
