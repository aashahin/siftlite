import {
  hashLogicalDefinition,
  hashPhysicalManifest,
  physicalIndexIdFor,
  sql,
  type CheckReport,
  type DoctorFinding,
  type DoctorReport,
  type IndexDefinition,
  type SqlAdapter,
} from "@siftlite/core";
import { compileFts5PhysicalManifest } from "../manifest.js";
import { adjacentLeftoverGenerations, physicalNames } from "../names.js";
import { ensureRegistry, readRegistry } from "./registry-sql.js";
import { triggerNames } from "./triggers.js";
import { collectIntegrityFindings, triggerExists } from "./verify.js";

export async function checkIndex(
  adapter: SqlAdapter,
  definition: IndexDefinition,
): Promise<CheckReport> {
  const report = await doctorIndex(adapter, definition);
  return { ok: report.healthy, findings: report.findings };
}

export async function doctorIndex(
  adapter: SqlAdapter,
  definition: IndexDefinition,
): Promise<DoctorReport> {
  await ensureRegistry(adapter);
  const findings: DoctorFinding[] = [];
  const registry = await readRegistry(adapter, definition.name);
  const physicalIndexId = registry?.physicalIndexId ?? physicalIndexIdFor(definition.name);
  const generation = registry?.activeGeneration ?? 1;
  const names = physicalNames(definition, physicalIndexId, generation);
  const docs = await tableExists(adapter, names.docs);
  const fts = await tableExists(adapter, names.fts);

  if (!registry) {
    if (docs || fts) {
      findings.push({
        severity: "error",
        code: "partial-physical",
        message: "physical objects exist without a healthy registry row",
      });
    } else {
      findings.push({
        severity: "error",
        code: "index-missing",
        message: "index is not registered",
      });
    }
    return { healthy: false, findings, registry: null };
  }

  if (registry.health === "pending") {
    findings.push({
      severity: "error",
      code: "registry-pending",
      message: "registry health is pending",
    });
  } else if (registry.health !== "healthy") {
    findings.push({
      severity: "error",
      code: "registry-unhealthy",
      message: "registry health is not healthy",
    });
  }

  if (!docs || !fts) {
    findings.push({
      severity: "error",
      code: "missing-physical",
      message: "required docs/fts objects are missing",
    });
  }

  const expectedDefinition = hashLogicalDefinition(definition);
  if (registry.definitionHash !== expectedDefinition) {
    findings.push({
      severity: "warn",
      code: "definition-drift",
      message: "logical definition hash differs from registry",
    });
  }

  const manifest = compileFts5PhysicalManifest({
    definition,
    physicalIndexId,
    generation,
  });
  if (registry.physicalSchemaHash !== hashPhysicalManifest(manifest)) {
    findings.push({
      severity: "error",
      code: "physical-drift",
      message: "physical schema hash differs from registry",
    });
  }

  if (definition.mode === "linked" && definition.source) {
    const triggers = triggerNames(names.docs);
    for (const name of [triggers.insert, triggers.update, triggers.delete]) {
      if (!(await triggerExists(adapter, name))) {
        findings.push({
          severity: "error",
          code: "missing-trigger",
          message: `trigger ${name} is missing`,
        });
      }
    }
  }

  for (const leftover of adjacentLeftoverGenerations(generation)) {
    const leftoverNames = physicalNames(definition, physicalIndexId, leftover);
    if (
      (await tableExists(adapter, leftoverNames.docs)) ||
      (await tableExists(adapter, leftoverNames.fts))
    ) {
      findings.push({
        severity: "error",
        code: "leftover-generation",
        message: `leftover physical objects exist for generation ${leftover}`,
      });
    }
  }

  const integrity = await collectIntegrityFindings(
    adapter,
    definition,
    physicalIndexId,
    generation,
  );
  for (const finding of integrity) {
    if (!findings.some((existing) => existing.code === finding.code)) {
      findings.push(finding);
    }
  }

  const healthy = findings.every((finding) => finding.severity !== "error");
  return { healthy, findings, registry };
}

async function tableExists(adapter: SqlAdapter, name: string): Promise<boolean> {
  const rows = await adapter.query<{ name: string }>(
    sql(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`, [name]),
  );
  return rows.length > 0;
}
