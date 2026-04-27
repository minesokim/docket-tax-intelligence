import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildInsertPlan,
  createConfiguredAsyncDocketRepository,
  createConfiguredDocketRepository,
  createDefaultDocketTableSpecs,
  createPgPoolPostgresDriver,
  createAsyncPostgresDocketRepository,
  createPostgresDocketRepository,
  runDocketMigrations,
  runConfiguredDocketMigrations,
  type AsyncPostgresDriver,
  type DocketTableSpec,
  type PostgresDriver,
  type PostgresRow,
} from "../src/index";

type TestData = {
  firms: Array<{
    id: string;
    name: string;
    defaultJurisdiction: string;
    taxKnowledgeFreshnessHours: number;
  }>;
  modelProviders: Array<{
    id: string;
    name: string;
    enabled: boolean;
    externalCallsAllowed: boolean;
  }>;
};

class RecordingDriver implements PostgresDriver {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  private readonly rows = new Map<string, PostgresRow[]>();

  query<TRow extends PostgresRow = PostgresRow>(sql: string, params: readonly unknown[] = []): readonly TRow[] {
    this.calls.push({ sql, params });

    const selectMatch = sql.match(/^SELECT \* FROM "([^"]+)"/u);
    if (selectMatch?.[1]) {
      return (this.rows.get(selectMatch[1]) ?? []) as TRow[];
    }

    const selectIdsMatch = sql.match(/^SELECT id FROM ([a-z_][a-z0-9_]*)/u);
    if (selectIdsMatch?.[1]) {
      return (this.rows.get(selectIdsMatch[1]) ?? []).map((row) => ({ id: row.id })) as unknown as TRow[];
    }

    const deleteMatch = sql.match(/^DELETE FROM "([^"]+)"/u);
    if (deleteMatch?.[1]) {
      this.rows.set(deleteMatch[1], []);
      return [];
    }

    const insertMatch = sql.match(/^INSERT INTO "([^"]+)" \(([^)]+)\)/u);
    if (insertMatch?.[1] && insertMatch[2]) {
      const columns = insertMatch[2].split(", ").map((column) => column.replaceAll('"', ""));
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
      this.rows.set(insertMatch[1], [...(this.rows.get(insertMatch[1]) ?? []), row]);
      return [];
    }

    const unquotedInsertMatch = sql.match(/^INSERT INTO ([a-z_][a-z0-9_]*) \(([^)]+)\)/u);
    if (unquotedInsertMatch?.[1] && unquotedInsertMatch[2]) {
      const columns = unquotedInsertMatch[2].split(", ");
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
      this.rows.set(unquotedInsertMatch[1], [...(this.rows.get(unquotedInsertMatch[1]) ?? []), row]);
      return [];
    }

    return [];
  }

  transaction<TResult>(callback: () => TResult): TResult {
    this.calls.push({ sql: "BEGIN", params: [] });
    const result = callback();
    this.calls.push({ sql: "COMMIT", params: [] });
    return result;
  }
}

class AsyncRecordingDriver implements AsyncPostgresDriver {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  private readonly driver = new RecordingDriver();

  async query<TRow extends PostgresRow = PostgresRow>(sql: string, params: readonly unknown[] = []): Promise<readonly TRow[]> {
    this.calls.push({ sql, params });
    if (sql === "SELECT id FROM docket_schema_migrations") {
      return this.driver.query(sql, params);
    }
    return this.driver.query(sql, params);
  }

  async transaction<TResult>(callback: () => Promise<TResult>): Promise<TResult> {
    this.calls.push({ sql: "BEGIN", params: [] });
    const result = await callback();
    this.calls.push({ sql: "COMMIT", params: [] });
    return result;
  }
}

const seedData = (): TestData => ({
  firms: [
    {
      id: "firm-test",
      name: "Docket Test Firm",
      defaultJurisdiction: "US",
      taxKnowledgeFreshnessHours: 72,
    },
  ],
  modelProviders: [
    {
      id: "provider-mock",
      name: "mock",
      enabled: true,
      externalCallsAllowed: false,
    },
  ],
});

const tableSpecs: readonly DocketTableSpec<TestData>[] = [
  {
    dataKey: "firms",
    tableName: "firms",
    storage: "relational",
    numericColumns: ["taxKnowledgeFreshnessHours"],
  },
  {
    dataKey: "modelProviders",
    tableName: "model_providers",
    storage: "document",
  },
];

describe("@docket/db repository mapping", () => {
  it("declares default table specs for relational and document-backed Docket collections", () => {
    const specs = createDefaultDocketTableSpecs<Record<string, unknown>>();
    expect(specs).toContainEqual(expect.objectContaining({ dataKey: "taxFacts", tableName: "tax_facts", storage: "relational" }));
    expect(specs).toContainEqual(
      expect.objectContaining({ dataKey: "taxProBenchmarkCases", tableName: "tax_pro_benchmark_cases", storage: "document" }),
    );
  });

  it("keeps default table specs aligned with the migration file", () => {
    const migration = readFileSync(new URL("../../../infra/migrations/0001_initial.sql", import.meta.url), "utf8");
    const specs = createDefaultDocketTableSpecs<Record<string, unknown>>();

    for (const spec of specs) {
      expect(migration).toContain(`CREATE TABLE ${spec.tableName}`);
    }
  });

  it("builds parameterized insert plans and rejects unsafe identifiers", () => {
    const plan = buildInsertPlan("firms", { id: "firm-test", name: "Docket" });
    expect(plan.sql).toBe('INSERT INTO "firms" ("id", "name") VALUES ($1, $2)');
    expect(plan.params).toEqual(["firm-test", "Docket"]);
    expect(() => buildInsertPlan("firms; drop table audit_events", { id: "bad" })).toThrow("Unsafe SQL identifier");
  });

  it("writes and reads through the Postgres table mapper contract", () => {
    const driver = new RecordingDriver();
    const repository = createPostgresDocketRepository<TestData>({
      connectionString: "postgres://postgres:postgres@localhost:5432/docket",
      driver,
      seedData,
      tableSpecs,
    });

    repository.reset();
    const read = repository.read();

    expect(driver.calls.some((call) => call.sql === "BEGIN")).toBe(true);
    expect(driver.calls).toContainEqual(expect.objectContaining({ sql: 'DELETE FROM "model_providers"' }));
    expect(driver.calls).toContainEqual(expect.objectContaining({ sql: 'DELETE FROM "firms"' }));
    expect(driver.calls.some((call) => call.sql.startsWith('INSERT INTO "firms"'))).toBe(true);
    expect(driver.calls.some((call) => call.sql.startsWith('INSERT INTO "model_providers"'))).toBe(true);
    expect(read.firms[0]?.taxKnowledgeFreshnessHours).toBe(72);
    expect(read.modelProviders[0]?.name).toBe("mock");
  });

  it("supports async Postgres repositories for real pg-style drivers", async () => {
    const driver = new AsyncRecordingDriver();
    const repository = createAsyncPostgresDocketRepository<TestData>({
      connectionString: "postgres://postgres:postgres@localhost:5432/docket",
      driver,
      seedData,
      tableSpecs,
    });

    await repository.reset();
    const read = await repository.read();

    expect(repository.kind).toBe("postgres");
    expect(driver.calls.some((call) => call.sql === "BEGIN")).toBe(true);
    expect(read.firms[0]?.name).toBe("Docket Test Firm");
    expect(read.modelProviders[0]?.externalCallsAllowed).toBe(false);
  });

  it("keeps configured sync repositories file-backed unless Postgres is explicitly requested", () => {
    const repository = createConfiguredDocketRepository<TestData>({
      env: { DOCKET_PERSISTENCE: "file" },
      seedData,
    });

    expect(repository.kind).toBe("file");
    expect(() =>
      createConfiguredDocketRepository<TestData>({
        env: { DOCKET_PERSISTENCE: "postgres", DOCKET_ENABLE_POSTGRES: "true", DATABASE_URL: "postgres://localhost/docket" },
        seedData,
      }),
    ).toThrow("synchronous Docket runtime");
  });

  it("uses the async env factory as the Postgres opt-in path", async () => {
    const fileRepository = createConfiguredAsyncDocketRepository<TestData>({
      env: { DOCKET_PERSISTENCE: "file" },
      seedData,
    });

    expect(fileRepository.kind).toBe("file");

    expect(() =>
      createConfiguredAsyncDocketRepository<TestData>({
        env: { DOCKET_PERSISTENCE: "postgres", DOCKET_ENABLE_POSTGRES: "false", DATABASE_URL: "postgres://localhost/docket" },
        seedData,
      }),
    ).toThrow("DOCKET_ENABLE_POSTGRES=true");

    const driver = createPgPoolPostgresDriver("postgres://postgres:postgres@localhost:5432/docket");
    await driver.close?.();
  });

  it("runs migrations once and records applied migration ids", async () => {
    const driver = new AsyncRecordingDriver();
    const first = await runDocketMigrations(driver, [{ id: "test_migration", sql: "CREATE TABLE test_migration (id text PRIMARY KEY)" }]);
    const second = await runDocketMigrations(driver, [{ id: "test_migration", sql: "CREATE TABLE test_migration (id text PRIMARY KEY)" }]);

    expect(first).toEqual({ applied: ["test_migration"], skipped: [] });
    expect(second).toEqual({ applied: [], skipped: ["test_migration"] });
    expect(driver.calls.some((call) => call.sql.includes("docket_schema_migrations"))).toBe(true);
  });

  it("requires explicit Postgres enablement before configured migrations run", async () => {
    await expect(runConfiguredDocketMigrations({ DOCKET_ENABLE_POSTGRES: "false", DATABASE_URL: "postgres://localhost/docket" })).rejects.toThrow(
      "DOCKET_ENABLE_POSTGRES=true",
    );
    await expect(runConfiguredDocketMigrations({ DOCKET_ENABLE_POSTGRES: "true" })).rejects.toThrow("DATABASE_URL is required");
  });
});
