import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pg, { type PoolClient, type PoolConfig } from "pg";

const { Pool } = pg;

export const CORE_TABLES = {
  firms: "firms",
  firmUsers: "firm_users",
  roles: "roles",
  permissions: "permissions",
  clients: "clients",
  clientContacts: "client_contacts",
  taxHouseholdMembers: "tax_household_members",
  engagements: "engagements",
  engagementScopes: "engagement_scopes",
  taxReturns: "tax_returns",
  sourceDocuments: "source_documents",
  documentExtractions: "document_extractions",
  extractedFields: "extracted_fields",
  documentFlags: "document_flags",
  evidenceRefs: "evidence_refs",
  taxFacts: "tax_facts",
  clientContextFacts: "client_context_facts",
  clientClaims: "client_claims",
  conversations: "conversations",
  conversationMessages: "conversation_messages",
  conversationInsights: "conversation_insights",
  priorYearPatterns: "prior_year_patterns",
  missingDocuments: "missing_documents",
  contradictions: "contradictions",
  deductionOpportunities: "deduction_opportunities",
  taxIssues: "tax_issues",
  taxFlags: "tax_flags",
  clientClarifications: "client_clarifications",
  reviewerNotes: "reviewer_notes",
  workpapers: "workpapers",
  taxAuthoritySources: "tax_authority_sources",
  taxAuthorityVersions: "tax_authority_versions",
  taxCitations: "tax_citations",
  taxSourceIngestionRuns: "tax_source_ingestion_runs",
  taxSourceChanges: "tax_source_changes",
  taxImpactAssessments: "tax_impact_assessments",
  taxKnowledgeSnapshots: "tax_knowledge_snapshots",
  taxRules: "tax_rules",
  taxRuleVersions: "tax_rule_versions",
  taxRulePackages: "tax_rule_packages",
  returnKnowledgeSnapshots: "return_knowledge_snapshots",
  aiReasoningRuns: "ai_reasoning_runs",
  aiPrepRuns: "ai_prep_runs",
  modelProviders: "model_providers",
  promptVersions: "prompt_versions",
  modelEvalRuns: "model_eval_runs",
  taxProBenchmarkCases: "tax_pro_benchmark_cases",
  reviewerCorrections: "reviewer_corrections",
  expertPreferenceRatings: "expert_preference_ratings",
  consentRecords: "consent_records",
  auditEvents: "audit_events",
  firmPolicies: "firm_policies",
  securitySettings: "security_settings",
  dataRetentionPolicies: "data_retention_policies",
  integrationConnections: "integration_connections",
  subprocessorRecords: "subprocessor_records",
  signatureAuthorizations: "signature_authorizations",
  exportPackages: "export_packages",
  postFilingEvents: "post_filing_events",
} as const;

export const PGVECTOR_READY_TABLES = ["tax_authority_versions", "source_documents", "conversation_messages"] as const;

export const MIGRATION_PATH = "infra/migrations/0001_initial.sql";

export type WorkflowLike<TData> = {
  data: TData;
};

export interface DocketRepository<TData> {
  readonly kind: "file" | "memory" | "postgres";
  read(): TData;
  write(data: TData): TData;
  reset(): TData;
  transact<TResult extends WorkflowLike<TData>>(workflow: (data: TData) => TResult): TResult;
}

export interface AsyncDocketRepository<TData> {
  readonly kind: "file" | "memory" | "postgres";
  read(): Promise<TData>;
  write(data: TData): Promise<TData>;
  reset(): Promise<TData>;
  transact<TResult extends WorkflowLike<TData>>(workflow: (data: TData) => TResult | Promise<TResult>): Promise<TResult>;
  close?(): Promise<void>;
}

export type JsonFileRepositoryOptions<TData> = {
  statePath?: string;
  workspaceRootName?: string;
  seedData: () => TData;
};

export type PostgresRepositoryOptions<TData> = {
  connectionString: string;
  driver: PostgresDriver;
  seedData: () => TData;
  tableSpecs?: readonly DocketTableSpec<TData>[];
};

export type AsyncPostgresRepositoryOptions<TData> = {
  connectionString: string;
  driver: AsyncPostgresDriver;
  seedData: () => TData;
  tableSpecs?: readonly DocketTableSpec<TData>[];
};

export type ConfiguredRepositoryOptions<TData> = {
  seedData: () => TData;
  env?: Record<string, string | undefined>;
  statePath?: string;
  tableSpecs?: readonly DocketTableSpec<TData>[];
};

export type DocketMigration = {
  id: string;
  sql: string;
};

export type MigrationRunResult = {
  applied: string[];
  skipped: string[];
};

function cloneJson<TData>(data: TData): TData {
  return JSON.parse(JSON.stringify(data)) as TData;
}

export type PostgresRow = Record<string, unknown>;

export type PostgresDriver = {
  query<TRow extends PostgresRow = PostgresRow>(sql: string, params?: readonly unknown[]): readonly TRow[];
  transaction?<TResult>(callback: () => TResult): TResult;
};

export type AsyncPostgresDriver = {
  query<TRow extends PostgresRow = PostgresRow>(sql: string, params?: readonly unknown[]): Promise<readonly TRow[]>;
  transaction?<TResult>(callback: () => Promise<TResult>): Promise<TResult>;
  close?(): Promise<void>;
};

export type DocketTableSpec<TData> = {
  dataKey: Extract<keyof TData, string>;
  tableName: string;
  storage: "relational" | "document";
  jsonColumns?: readonly string[];
  numericColumns?: readonly string[];
};

const DEFAULT_JSON_COLUMNS = [
  "permissions",
  "tags",
  "residencyPeriods",
  "supportFacts",
  "scopes",
  "fixtureFields",
  "bbox",
  "value",
  "evidenceRefs",
  "relatedIssueIds",
  "normalizedValue",
  "sourceIds",
  "missingFacts",
  "missingDocuments",
  "evidenceRefIds",
  "topicTags",
  "sourceVersionIds",
  "ruleVersionIds",
  "changedSourceIds",
  "affectedForms",
  "affectedTaxYears",
  "inputSourceIds",
  "output",
  "aiReasoningRunIds",
  "createdFactIds",
  "createdIssueIds",
  "createdClarificationIds",
  "createdWorkpaperIds",
  "metadata",
  "conditionsJson",
  "packetJson",
  "consentTypesRequired",
] as const;

const DEFAULT_NUMERIC_COLUMNS = [
  "taxYear",
  "taxKnowledgeFreshnessHours",
  "responsivenessScore",
  "averageResponseDays",
  "confidence",
  "pageNumber",
  "priorTaxYear",
  "costEstimateUsd",
  "costUsd",
  "latencyMs",
  "falseClearanceRate",
  "citationCorrectness",
  "unsupportedFactRate",
  "reviewerOverrideRate",
  "score",
  "readinessScore",
  "extensionRiskScore",
  "retainForYears",
] as const;

const RELATIONAL_DOCKET_TABLES = [
  ["firms", CORE_TABLES.firms],
  ["firmUsers", CORE_TABLES.firmUsers],
  ["clients", CORE_TABLES.clients],
  ["clientContacts", CORE_TABLES.clientContacts],
  ["householdMembers", CORE_TABLES.taxHouseholdMembers],
  ["engagements", CORE_TABLES.engagements],
  ["taxKnowledgeSnapshots", CORE_TABLES.taxKnowledgeSnapshots],
  ["taxRulePackages", CORE_TABLES.taxRulePackages],
  ["taxReturns", CORE_TABLES.taxReturns],
  ["sourceDocuments", CORE_TABLES.sourceDocuments],
  ["documentExtractions", CORE_TABLES.documentExtractions],
  ["extractedFields", CORE_TABLES.extractedFields],
  ["documentFlags", CORE_TABLES.documentFlags],
  ["evidenceRefs", CORE_TABLES.evidenceRefs],
  ["taxFacts", CORE_TABLES.taxFacts],
  ["conversations", CORE_TABLES.conversations],
  ["conversationMessages", CORE_TABLES.conversationMessages],
  ["clientClaims", CORE_TABLES.clientClaims],
  ["conversationInsights", CORE_TABLES.conversationInsights],
  ["priorYearPatterns", CORE_TABLES.priorYearPatterns],
  ["missingDocuments", CORE_TABLES.missingDocuments],
  ["contradictions", CORE_TABLES.contradictions],
  ["deductionOpportunities", CORE_TABLES.deductionOpportunities],
  ["taxIssues", CORE_TABLES.taxIssues],
  ["clientClarifications", CORE_TABLES.clientClarifications],
  ["workpapers", CORE_TABLES.workpapers],
  ["taxAuthoritySources", CORE_TABLES.taxAuthoritySources],
  ["taxAuthorityVersions", CORE_TABLES.taxAuthorityVersions],
  ["taxSourceIngestionRuns", CORE_TABLES.taxSourceIngestionRuns],
  ["taxSourceChanges", CORE_TABLES.taxSourceChanges],
  ["taxImpactAssessments", CORE_TABLES.taxImpactAssessments],
  ["aiReasoningRuns", CORE_TABLES.aiReasoningRuns],
  ["aiPrepRuns", CORE_TABLES.aiPrepRuns],
  ["consentRecords", CORE_TABLES.consentRecords],
  ["auditEvents", CORE_TABLES.auditEvents],
  ["firmPolicies", CORE_TABLES.firmPolicies],
  ["securitySettings", CORE_TABLES.securitySettings],
  ["integrationConnections", CORE_TABLES.integrationConnections],
  ["signatureAuthorizations", CORE_TABLES.signatureAuthorizations],
  ["exportPackages", CORE_TABLES.exportPackages],
  ["postFilingEvents", CORE_TABLES.postFilingEvents],
] as const;

const DOCUMENT_DOCKET_TABLES = [
  ["clientContextFacts", CORE_TABLES.clientContextFacts],
  ["taxFlags", CORE_TABLES.taxFlags],
  ["reviewerNotes", CORE_TABLES.reviewerNotes],
  ["taxCitations", CORE_TABLES.taxCitations],
  ["taxRules", CORE_TABLES.taxRules],
  ["taxRuleVersions", CORE_TABLES.taxRuleVersions],
  ["returnKnowledgeSnapshots", CORE_TABLES.returnKnowledgeSnapshots],
  ["modelProviders", CORE_TABLES.modelProviders],
  ["promptVersions", CORE_TABLES.promptVersions],
  ["modelEvalRuns", CORE_TABLES.modelEvalRuns],
  ["taxProBenchmarkCases", CORE_TABLES.taxProBenchmarkCases],
  ["reviewerCorrections", CORE_TABLES.reviewerCorrections],
  ["expertPreferenceRatings", CORE_TABLES.expertPreferenceRatings],
  ["dataRetentionPolicies", CORE_TABLES.dataRetentionPolicies],
  ["subprocessorRecords", CORE_TABLES.subprocessorRecords],
] as const;

export function createDefaultDocketTableSpecs<TData>(): readonly DocketTableSpec<TData>[] {
  return [
    ...RELATIONAL_DOCKET_TABLES.map(([dataKey, tableName]) => ({
      dataKey: dataKey as Extract<keyof TData, string>,
      tableName,
      storage: "relational" as const,
      jsonColumns: DEFAULT_JSON_COLUMNS,
      numericColumns: DEFAULT_NUMERIC_COLUMNS,
    })),
    ...DOCUMENT_DOCKET_TABLES.map(([dataKey, tableName]) => ({
      dataKey: dataKey as Extract<keyof TData, string>,
      tableName,
      storage: "document" as const,
    })),
  ];
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function encodeColumnValue(value: unknown, column: string, spec: DocketTableSpec<unknown>): unknown {
  if (value === undefined) return undefined;
  if (spec.jsonColumns?.includes(column) && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

function decodeColumnValue(value: unknown, property: string, spec: DocketTableSpec<unknown>): unknown {
  if (value === null || value === undefined) return value;
  if (spec.jsonColumns?.includes(property) && typeof value === "string") {
    return JSON.parse(value) as unknown;
  }
  if (spec.numericColumns?.includes(property) && typeof value === "string") {
    return Number(value);
  }
  return value;
}

function entityToRelationalRow(entity: unknown, spec: DocketTableSpec<unknown>): PostgresRow {
  const source = entity as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source)
      .map(([property, value]) => [camelToSnake(property), encodeColumnValue(value, property, spec)] as const)
      .filter(([, value]) => value !== undefined),
  );
}

function relationalRowToEntity(row: PostgresRow, spec: DocketTableSpec<unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => {
      const property = snakeToCamel(column);
      return [property, decodeColumnValue(value, property, spec)] as const;
    }),
  );
}

function documentReferenceColumns(source: Record<string, unknown>): PostgresRow {
  const references: PostgresRow = {};
  const referenceColumns = [
    "firmId",
    "clientId",
    "taxReturnId",
    "issueId",
    "sourceId",
    "ruleId",
    "knowledgeSnapshotId",
    "rulePackageId",
    "aiRunId",
    "benchmarkCaseId",
  ];

  for (const property of referenceColumns) {
    if (source[property] !== undefined) {
      references[camelToSnake(property)] = source[property];
    }
  }

  return references;
}

function entityToRow<TData>(entity: unknown, spec: DocketTableSpec<TData>): PostgresRow {
  if (spec.storage === "document") {
    const source = entity as Record<string, unknown>;
    return {
      id: source.id,
      ...documentReferenceColumns(source),
      payload: JSON.stringify(entity),
    };
  }

  return entityToRelationalRow(entity, spec as DocketTableSpec<unknown>);
}

function rowToEntity<TData>(row: PostgresRow, spec: DocketTableSpec<TData>): unknown {
  if (spec.storage === "document") {
    const payload = row.payload;
    return typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  }

  return relationalRowToEntity(row, spec as DocketTableSpec<unknown>);
}

function readPersistenceMode(env: Record<string, string | undefined>): "file" | "postgres" {
  const raw = env.DOCKET_PERSISTENCE ?? env.DOCKET_REPOSITORY ?? "file";
  if (raw === "file" || raw === "postgres") return raw;
  throw new Error(`Unsupported DOCKET_PERSISTENCE value: ${raw}`);
}

export type InsertPlan = {
  sql: string;
  params: readonly unknown[];
};

export function buildInsertPlan(tableName: string, row: PostgresRow): InsertPlan {
  const columns = Object.keys(row);
  const values = Object.values(row);
  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

  return {
    sql: `INSERT INTO ${quoteIdentifier(tableName)} (${quotedColumns}) VALUES (${placeholders})`,
    params: values,
  };
}

function findWorkspaceRoot(start: string, rootPackageName: string): string {
  let current = resolve(start);

  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = join(current, "package.json");
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: string };
        if (pkg.name === rootPackageName) {
          return current;
        }
      } catch {
        // Keep walking upward.
      }
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return resolve(start);
}

export function getDefaultDocketStatePath(start = process.cwd()): string {
  if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
    return process.env.DOCKET_STATE_PATH ?? join("/tmp", "docket", "state.json");
  }

  return process.env.DOCKET_STATE_PATH ?? join(findWorkspaceRoot(start, "docket"), ".docket", "state.json");
}

export function getDefaultMigrationSql(start = process.cwd()): string {
  return readFileSync(join(findWorkspaceRoot(start, "docket"), MIGRATION_PATH), "utf8");
}

export async function runDocketMigrations(
  driver: AsyncPostgresDriver,
  migrations: readonly DocketMigration[] = [{ id: "0001_initial", sql: getDefaultMigrationSql() }],
): Promise<MigrationRunResult> {
  await driver.query(`
    CREATE TABLE IF NOT EXISTS docket_schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const rows = await driver.query<{ id: string }>("SELECT id FROM docket_schema_migrations");
  const appliedIds = new Set(rows.map((row) => row.id));
  const result: MigrationRunResult = { applied: [], skipped: [] };

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      result.skipped.push(migration.id);
      continue;
    }

    const applyMigration = async () => {
      await driver.query(migration.sql);
      await driver.query("INSERT INTO docket_schema_migrations (id) VALUES ($1)", [migration.id]);
    };

    if (driver.transaction) {
      await driver.transaction(applyMigration);
    } else {
      await applyMigration();
    }

    result.applied.push(migration.id);
  }

  return result;
}

export async function runConfiguredDocketMigrations(env: Record<string, string | undefined> = process.env): Promise<MigrationRunResult> {
  if (env.DOCKET_ENABLE_POSTGRES !== "true") {
    throw new Error("Set DOCKET_ENABLE_POSTGRES=true before running Docket Postgres migrations.");
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run Docket Postgres migrations.");
  }

  const driver = createPgPoolPostgresDriver(env.DATABASE_URL);
  try {
    return await runDocketMigrations(driver);
  } finally {
    await driver.close?.();
  }
}

export class JsonFileDocketRepository<TData> implements DocketRepository<TData> {
  readonly kind = "file" as const;

  constructor(private readonly options: JsonFileRepositoryOptions<TData>) {}

  private get statePath(): string {
    return this.options.statePath ?? getDefaultDocketStatePath();
  }

  read(): TData {
    const path = this.statePath;
    if (!existsSync(path)) {
      return this.reset();
    }

    return JSON.parse(readFileSync(path, "utf8")) as TData;
  }

  write(data: TData): TData {
    const path = this.statePath;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    return data;
  }

  reset(): TData {
    return this.write(cloneJson(this.options.seedData()));
  }

  transact<TResult extends WorkflowLike<TData>>(workflow: (data: TData) => TResult): TResult {
    const result = workflow(this.read());
    this.write(result.data);
    return result;
  }
}

export class InMemoryDocketRepository<TData> implements DocketRepository<TData> {
  readonly kind = "memory" as const;
  private data: TData;

  constructor(private readonly seedData: () => TData) {
    this.data = cloneJson(seedData());
  }

  read(): TData {
    return cloneJson(this.data);
  }

  write(data: TData): TData {
    this.data = cloneJson(data);
    return this.read();
  }

  reset(): TData {
    this.data = cloneJson(this.seedData());
    return this.read();
  }

  transact<TResult extends WorkflowLike<TData>>(workflow: (data: TData) => TResult): TResult {
    const result = workflow(this.read());
    this.write(result.data);
    return result;
  }
}

export class PostgresDocketRepository<TData> implements DocketRepository<TData> {
  readonly kind = "postgres" as const;
  private readonly tableSpecs: readonly DocketTableSpec<TData>[];

  constructor(private readonly options: PostgresRepositoryOptions<TData>) {
    this.tableSpecs = options.tableSpecs ?? createDefaultDocketTableSpecs<TData>();
  }

  read(): TData {
    const data = cloneJson(this.options.seedData()) as Record<string, unknown>;

    for (const spec of this.tableSpecs) {
      const rows = this.options.driver.query(`SELECT * FROM ${quoteIdentifier(spec.tableName)} ORDER BY "id" ASC`);
      data[spec.dataKey] = rows.map((row) => this.rowToEntity(row, spec));
    }

    return data as TData;
  }

  write(data: TData): TData {
    const writeAll = () => {
      for (const spec of [...this.tableSpecs].reverse()) {
        this.options.driver.query(`DELETE FROM ${quoteIdentifier(spec.tableName)}`);
      }

      const record = data as Record<string, unknown>;
      for (const spec of this.tableSpecs) {
        const entities = record[spec.dataKey];
        if (!Array.isArray(entities)) continue;

        for (const entity of entities) {
          const row = this.entityToRow(entity, spec);
          const insert = buildInsertPlan(spec.tableName, row);
          this.options.driver.query(insert.sql, insert.params);
        }
      }

      return data;
    };

    return this.options.driver.transaction ? this.options.driver.transaction(writeAll) : writeAll();
  }

  reset(): TData {
    return this.write(cloneJson(this.options.seedData()));
  }

  transact<TResult extends WorkflowLike<TData>>(workflow: (data: TData) => TResult): TResult {
    const run = () => {
      const result = workflow(this.read());
      this.write(result.data);
      return result;
    };

    return this.options.driver.transaction ? this.options.driver.transaction(run) : run();
  }

  private redactedConnectionLabel(): string {
    const url = new URL(this.options.connectionString);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}/${url.pathname.replace(/^\/+/, "")}`;
  }

  private entityToRow(entity: unknown, spec: DocketTableSpec<TData>): PostgresRow {
    return entityToRow(entity, spec);
  }

  private rowToEntity(row: PostgresRow, spec: DocketTableSpec<TData>): unknown {
    return rowToEntity(row, spec);
  }
}

export class PgPoolPostgresDriver implements AsyncPostgresDriver {
  private readonly pool: pg.Pool;
  private transactionClient: PoolClient | null = null;

  constructor(connectionString: string, config: Omit<PoolConfig, "connectionString"> = {}) {
    this.pool = new Pool({ ...config, connectionString });
  }

  async query<TRow extends PostgresRow = PostgresRow>(sql: string, params: readonly unknown[] = []): Promise<readonly TRow[]> {
    const result = this.transactionClient
      ? await this.transactionClient.query(sql, [...params])
      : await this.pool.query(sql, [...params]);
    return result.rows as TRow[];
  }

  async transaction<TResult>(callback: () => Promise<TResult>): Promise<TResult> {
    if (this.transactionClient) {
      return callback();
    }

    const client = await this.pool.connect();
    this.transactionClient = client;
    try {
      await client.query("BEGIN");
      const result = await callback();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      this.transactionClient = null;
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class AsyncAdapterRepository<TData> implements AsyncDocketRepository<TData> {
  constructor(private readonly repository: DocketRepository<TData>) {}

  get kind(): DocketRepository<TData>["kind"] {
    return this.repository.kind;
  }

  async read(): Promise<TData> {
    return this.repository.read();
  }

  async write(data: TData): Promise<TData> {
    return this.repository.write(data);
  }

  async reset(): Promise<TData> {
    return this.repository.reset();
  }

  async transact<TResult extends WorkflowLike<TData>>(workflow: (data: TData) => TResult | Promise<TResult>): Promise<TResult> {
    const data = this.repository.read();
    const result = await workflow(data);
    this.repository.write(result.data);
    return result;
  }
}

export class AsyncPostgresDocketRepository<TData> implements AsyncDocketRepository<TData> {
  readonly kind = "postgres" as const;
  private readonly tableSpecs: readonly DocketTableSpec<TData>[];

  constructor(private readonly options: AsyncPostgresRepositoryOptions<TData>) {
    this.tableSpecs = options.tableSpecs ?? createDefaultDocketTableSpecs<TData>();
  }

  async read(): Promise<TData> {
    const data = cloneJson(this.options.seedData()) as Record<string, unknown>;

    for (const spec of this.tableSpecs) {
      const rows = await this.options.driver.query(`SELECT * FROM ${quoteIdentifier(spec.tableName)} ORDER BY "id" ASC`);
      data[spec.dataKey] = rows.map((row) => rowToEntity(row, spec));
    }

    return data as TData;
  }

  async write(data: TData): Promise<TData> {
    const writeAll = async () => {
      for (const spec of [...this.tableSpecs].reverse()) {
        await this.options.driver.query(`DELETE FROM ${quoteIdentifier(spec.tableName)}`);
      }

      const record = data as Record<string, unknown>;
      for (const spec of this.tableSpecs) {
        const entities = record[spec.dataKey];
        if (!Array.isArray(entities)) continue;

        for (const entity of entities) {
          const row = entityToRow(entity, spec);
          const insert = buildInsertPlan(spec.tableName, row);
          await this.options.driver.query(insert.sql, insert.params);
        }
      }

      return data;
    };

    return this.options.driver.transaction ? this.options.driver.transaction(writeAll) : writeAll();
  }

  async reset(): Promise<TData> {
    return this.write(cloneJson(this.options.seedData()));
  }

  async transact<TResult extends WorkflowLike<TData>>(workflow: (data: TData) => TResult | Promise<TResult>): Promise<TResult> {
    const run = async () => {
      const result = await workflow(await this.read());
      await this.write(result.data);
      return result;
    };

    return this.options.driver.transaction ? this.options.driver.transaction(run) : run();
  }

  async close(): Promise<void> {
    await this.options.driver.close?.();
  }
}

export function createJsonFileDocketRepository<TData>(options: JsonFileRepositoryOptions<TData>): DocketRepository<TData> {
  return new JsonFileDocketRepository(options);
}

export function createInMemoryDocketRepository<TData>(seedData: () => TData): DocketRepository<TData> {
  return new InMemoryDocketRepository(seedData);
}

export function createPostgresDocketRepository<TData>(options: PostgresRepositoryOptions<TData>): DocketRepository<TData> {
  return new PostgresDocketRepository(options);
}

export function createPgPoolPostgresDriver(connectionString: string, config?: Omit<PoolConfig, "connectionString">): AsyncPostgresDriver {
  return new PgPoolPostgresDriver(connectionString, config);
}

export function createAsyncPostgresDocketRepository<TData>(options: AsyncPostgresRepositoryOptions<TData>): AsyncDocketRepository<TData> {
  return new AsyncPostgresDocketRepository(options);
}

export function createConfiguredDocketRepository<TData>(options: ConfiguredRepositoryOptions<TData>): DocketRepository<TData> {
  const env = options.env ?? process.env;
  const mode = readPersistenceMode(env);

  if (mode === "postgres") {
    throw new Error("The synchronous Docket runtime cannot use DOCKET_PERSISTENCE=postgres. Use createConfiguredAsyncDocketRepository for Postgres wiring.");
  }

  return createJsonFileDocketRepository({
    seedData: options.seedData,
    ...(options.statePath ? { statePath: options.statePath } : {}),
  });
}

export function createConfiguredAsyncDocketRepository<TData>(options: ConfiguredRepositoryOptions<TData>): AsyncDocketRepository<TData> {
  const env = options.env ?? process.env;
  const mode = readPersistenceMode(env);

  if (mode !== "postgres") {
    return new AsyncAdapterRepository(
      createJsonFileDocketRepository({
        seedData: options.seedData,
        ...(options.statePath ? { statePath: options.statePath } : {}),
      }),
    );
  }

  if (env.DOCKET_ENABLE_POSTGRES !== "true") {
    throw new Error("Set DOCKET_ENABLE_POSTGRES=true before using Postgres persistence. Local demos remain file-backed by default.");
  }

  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when DOCKET_PERSISTENCE=postgres.");
  }

  return createAsyncPostgresDocketRepository({
    connectionString,
    driver: createPgPoolPostgresDriver(connectionString),
    seedData: options.seedData,
    ...(options.tableSpecs ? { tableSpecs: options.tableSpecs } : {}),
  });
}
