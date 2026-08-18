import { quoteIdent, SearchError, type IndexDefinition } from "@siftlite/core";
import { physicalNames } from "../names.js";
import { compileSearchableExpression } from "../normalize-sql.js";

export function triggerNames(docs: string): { insert: string; update: string; delete: string } {
  return {
    insert: `${docs}_ai`,
    update: `${docs}_au`,
    delete: `${docs}_ad`,
  };
}

export function compileLinkedTriggers(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): readonly string[] {
  if (!definition.source) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "linked triggers require a source table",
      details: { reason: "missing-source" },
    });
  }
  const names = physicalNames(definition, physicalIndexId, generation);
  const triggers = triggerNames(names.docs);
  const source = quoteIdent(definition.source.table);
  const pk = quoteIdent(definition.source.primaryKey.field);
  const docs = quoteIdent(names.docs);
  const fts = quoteIdent(names.fts);
  const projected = unique([...definition.filterableOrder, ...definition.sortableOrder]);
  const searchable = definition.searchableOrder;

  const docInsertCols = [
    quoteIdent("source_id"),
    ...searchable.map((field) => quoteIdent(`${field}_source`)),
    ...projected.map((field) => quoteIdent(field)),
  ];
  const docInsertVals = [
    `NEW.${pk}`,
    ...searchable.map((field) => `NEW.${quoteIdent(field)}`),
    ...projected.map((field) => `NEW.${quoteIdent(field)}`),
  ];
  const docUpdateSet = [
    `${quoteIdent("source_id")} = NEW.${pk}`,
    ...searchable.map((field) => `${quoteIdent(`${field}_source`)} = NEW.${quoteIdent(field)}`),
    ...projected.map((field) => `${quoteIdent(field)} = NEW.${quoteIdent(field)}`),
  ];
  const ftsInsertCols = [quoteIdent("rowid"), ...searchable.map((field) => quoteIdent(field))];
  const ftsInsertVals = [
    `(SELECT ${quoteIdent("doc_id")} FROM ${docs} WHERE ${quoteIdent("source_id")} = NEW.${pk})`,
    ...searchable.map((field) =>
      compileSearchableExpression(definition, `NEW.${quoteIdent(field)}`),
    ),
  ];
  const ftsUpdateSet = searchable.map(
    (field) =>
      `${quoteIdent(field)} = ${compileSearchableExpression(definition, `NEW.${quoteIdent(field)}`)}`,
  );

  return [
    `CREATE TRIGGER ${quoteIdent(triggers.insert)} AFTER INSERT ON ${source} BEGIN
  INSERT INTO ${docs} (${docInsertCols.join(", ")}) VALUES (${docInsertVals.join(", ")});
  INSERT INTO ${fts} (${ftsInsertCols.join(", ")}) VALUES (${ftsInsertVals.join(", ")});
END`,
    `CREATE TRIGGER ${quoteIdent(triggers.update)} AFTER UPDATE ON ${source} BEGIN
  UPDATE ${docs} SET ${docUpdateSet.join(", ")} WHERE ${quoteIdent("source_id")} = OLD.${pk};
  UPDATE ${fts} SET ${ftsUpdateSet.join(", ")} WHERE ${quoteIdent("rowid")} = (
    SELECT ${quoteIdent("doc_id")} FROM ${docs} WHERE ${quoteIdent("source_id")} = NEW.${pk}
  );
END`,
    `CREATE TRIGGER ${quoteIdent(triggers.delete)} AFTER DELETE ON ${source} BEGIN
  DELETE FROM ${fts} WHERE ${quoteIdent("rowid")} = (
    SELECT ${quoteIdent("doc_id")} FROM ${docs} WHERE ${quoteIdent("source_id")} = OLD.${pk}
  );
  DELETE FROM ${docs} WHERE ${quoteIdent("source_id")} = OLD.${pk};
END`,
  ];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
