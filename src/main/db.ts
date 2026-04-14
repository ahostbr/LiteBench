import Database from 'better-sqlite3';
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import suiteCatalogData from './data/suite-catalog.json';
import type {
  AgentSuiteDefinition,
  BenchmarkRun,
  BenchmarkRunRequest,
  BenchmarkSummary,
  BenchmarkTestDone,
  Endpoint,
  EndpointCreateInput,
  EndpointUpdateInput,
  ImportLegacyResponse,
  SeedSuiteResponse,
  SuiteDefinition,
  TestCase,
  TestCaseCreateInput,
  TestCaseUpdateInput,
  TestResult,
  TestSuite,
  TestSuiteCreateInput,
} from '../shared/types';

type SqlRow = Record<string, unknown>;

interface SuiteCatalog {
  defaults: SuiteDefinition[];
  standard: SuiteDefinition[];
  stress: SuiteDefinition[];
  speed: SuiteDefinition[];
  judgment: SuiteDefinition[];
  creator: SuiteDefinition[];
  agent: AgentSuiteDefinition[];
}

const suiteCatalog = suiteCatalogData as SuiteCatalog;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT 'lm-studio',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_suites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    suite_id INTEGER NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    test_id TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    user_prompt TEXT NOT NULL,
    eval_keywords TEXT NOT NULL DEFAULT '[]',
    eval_anti TEXT NOT NULL DEFAULT '[]',
    eval_json INTEGER NOT NULL DEFAULT 0,
    eval_sentence_count INTEGER,
    eval_regex TEXT NOT NULL DEFAULT '[]',
    eval_min_length INTEGER,
    max_tokens INTEGER NOT NULL DEFAULT 600,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_agent_task INTEGER NOT NULL DEFAULT 0,
    tool_hints TEXT NOT NULL DEFAULT '[]',
    expected_tool_calls INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER NOT NULL REFERENCES endpoints(id),
    suite_id INTEGER NOT NULL REFERENCES test_suites(id),
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    is_thinking INTEGER NOT NULL DEFAULT 0,
    is_agent_run INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    avg_score REAL,
    avg_tps REAL,
    total_time_s REAL,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    test_case_id INTEGER NOT NULL REFERENCES test_cases(id),
    test_id TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    elapsed_s REAL NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    tokens_per_sec REAL NOT NULL DEFAULT 0,
    finish_reason TEXT,
    final_score REAL NOT NULL DEFAULT 0,
    keyword_score REAL NOT NULL DEFAULT 0,
    keyword_hits TEXT NOT NULL DEFAULT '[]',
    keyword_misses TEXT NOT NULL DEFAULT '[]',
    violations TEXT NOT NULL DEFAULT '[]',
    had_thinking INTEGER NOT NULL DEFAULT 0,
    thinking_tokens_approx INTEGER NOT NULL DEFAULT 0,
    answer_length INTEGER NOT NULL DEFAULT 0,
    tool_calls_made INTEGER NOT NULL DEFAULT 0,
    tool_calls_correct INTEGER NOT NULL DEFAULT 0,
    tool_score REAL NOT NULL DEFAULT 0
);
`;

const DEFAULT_ENDPOINT = 'http://localhost:1234/v1';

const SUITE_METADATA: Record<
  keyof SuiteCatalog,
  { name: string; description: string; isDefault?: boolean }
> = {
  defaults: {
    name: 'Default Benchmark Suite',
    description:
      '10 tests covering code gen, bug finding, refactoring, reasoning, and more',
    isDefault: true,
  },
  standard: {
    name: 'Standard Suite',
    description:
      '25 comprehensive tests across 8 categories: code gen, multi-language, architecture, security, reasoning, code review, instruction following',
  },
  stress: {
    name: 'Stress Suite',
    description:
      '15 maximum-difficulty tests: long-form output, multi-step problems, 2000-4000 token budgets',
  },
  speed: {
    name: 'Speed Suite',
    description:
      '10 fast focused tasks optimized for throughput measurement, 150-300 token budgets',
  },
  judgment: {
    name: 'Judgment Suite',
    description:
      '12 tests for common sense, data hygiene, RAG refusal, epistemic calibration, and pipeline-vs-understanding judgment',
  },
  creator: {
    name: 'Creator Suite',
    description:
      '15 practical tests for content creators: YouTube hooks, tweets, summaries, emails, reasoning',
  },
  agent: {
    name: 'Agent Suite',
    description:
      '12 real-world agentic tasks: web search, file I/O, multi-step tool chaining, browser navigation, code execution',
  },
};

let db: Database.Database | null = null;

function getDatabaseFilePath(): string {
  if (app.isPackaged) {
    const userDataDir = app.getPath('userData');
    if (!existsSync(userDataDir)) {
      mkdirSync(userDataDir, { recursive: true });
    }
    return join(userDataDir, 'litebench.db');
  }
  return join(app.getAppPath(), 'backend', 'litebench.db');
}

function getNowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

function ensureDb(): Database.Database {
  if (!db) {
    throw new Error('Database has not been initialized');
  }
  return db;
}

function rowToEndpoint(row: SqlRow): Endpoint {
  return {
    id: Number(row.id),
    name: String(row.name),
    base_url: String(row.base_url),
    api_key: String(row.api_key),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  };
}

function rowToCase(row: SqlRow): TestCase {
  return {
    id: Number(row.id),
    suite_id: Number(row.suite_id),
    test_id: String(row.test_id),
    category: String(row.category),
    name: String(row.name),
    system_prompt: String(row.system_prompt),
    user_prompt: String(row.user_prompt),
    eval_keywords: parseJsonArray(row.eval_keywords),
    eval_anti: parseJsonArray(row.eval_anti),
    eval_json: Boolean(row.eval_json),
    eval_sentence_count:
      row.eval_sentence_count === null ? null : Number(row.eval_sentence_count),
    eval_regex: parseJsonArray(row.eval_regex),
    eval_min_length:
      row.eval_min_length === null ? null : Number(row.eval_min_length),
    max_tokens: Number(row.max_tokens),
    sort_order: Number(row.sort_order),
    is_agent_task: Boolean(row.is_agent_task),
    tool_hints: parseJsonArray(row.tool_hints),
    expected_tool_calls: Number(row.expected_tool_calls ?? 0),
  };
}

function rowToResult(row: SqlRow): TestResult {
  return {
    id: Number(row.id),
    run_id: Number(row.run_id),
    test_case_id: Number(row.test_case_id),
    test_id: String(row.test_id),
    category: String(row.category),
    name: String(row.name),
    content: String(row.content ?? ''),
    elapsed_s: Number(row.elapsed_s ?? 0),
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    tokens_per_sec: Number(row.tokens_per_sec ?? 0),
    finish_reason: row.finish_reason ? String(row.finish_reason) : null,
    final_score: Number(row.final_score ?? 0),
    keyword_score: Number(row.keyword_score ?? 0),
    keyword_hits: parseJsonArray(row.keyword_hits),
    keyword_misses: parseJsonArray(row.keyword_misses),
    violations: parseJsonArray(row.violations),
    had_thinking: Boolean(row.had_thinking),
    thinking_tokens_approx: Number(row.thinking_tokens_approx ?? 0),
    answer_length: Number(row.answer_length ?? 0),
    tool_calls_made: Number(row.tool_calls_made ?? 0),
    tool_calls_correct: Number(row.tool_calls_correct ?? 0),
    tool_score: Number(row.tool_score ?? 0),
  };
}

function rowToRun(row: SqlRow): BenchmarkRun {
  return {
    id: Number(row.id),
    endpoint_id: Number(row.endpoint_id),
    suite_id: Number(row.suite_id),
    model_id: String(row.model_id),
    model_name: String(row.model_name),
    is_thinking: Boolean(row.is_thinking),
    is_agent_run: Boolean(row.is_agent_run),
    status: String(row.status),
    avg_score: row.avg_score === null ? null : Number(row.avg_score),
    avg_tps: row.avg_tps === null ? null : Number(row.avg_tps),
    total_time_s:
      row.total_time_s === null ? null : Number(row.total_time_s),
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    results: [],
  };
}

function rowToSuite(row: SqlRow): TestSuite {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    is_default: Boolean(row.is_default),
    created_at: String(row.created_at),
    cases: [],
  };
}

function ensureColumn(table: string, column: string, sql: string): void {
  const tableInfo = ensureDb()
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  if (!tableInfo.some((info) => info.name === column)) {
    ensureDb().exec(sql);
  }
}

export function initializeDatabase(): string {
  const dbPath = getDatabaseFilePath();
  const directory = join(dbPath, '..');
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  ensureColumn(
    'test_cases',
    'eval_regex',
    "ALTER TABLE test_cases ADD COLUMN eval_regex TEXT NOT NULL DEFAULT '[]'",
  );
  ensureColumn(
    'test_cases',
    'eval_min_length',
    'ALTER TABLE test_cases ADD COLUMN eval_min_length INTEGER',
  );
  ensureColumn(
    'test_cases',
    'is_agent_task',
    'ALTER TABLE test_cases ADD COLUMN is_agent_task INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    'test_cases',
    'tool_hints',
    "ALTER TABLE test_cases ADD COLUMN tool_hints TEXT NOT NULL DEFAULT '[]'",
  );
  ensureColumn(
    'test_cases',
    'expected_tool_calls',
    'ALTER TABLE test_cases ADD COLUMN expected_tool_calls INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    'benchmark_runs',
    'is_agent_run',
    'ALTER TABLE benchmark_runs ADD COLUMN is_agent_run INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    'test_results',
    'tool_calls_made',
    'ALTER TABLE test_results ADD COLUMN tool_calls_made INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    'test_results',
    'tool_calls_correct',
    'ALTER TABLE test_results ADD COLUMN tool_calls_correct INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    'test_results',
    'tool_score',
    'ALTER TABLE test_results ADD COLUMN tool_score REAL NOT NULL DEFAULT 0',
  );

  ensureDb().prepare(
    "UPDATE benchmark_runs SET status = 'failed', completed_at = ? WHERE status = 'running'",
  ).run(getNowIso());

  const tokenBumps: Record<string, number> = {
    'codegen-2': 800,
    'reason-1': 1000,
    'instruct-1': 600,
    'instruct-2': 400,
  };
  const updateTokenStmt = ensureDb().prepare(
    'UPDATE test_cases SET max_tokens = ? WHERE test_id = ? AND max_tokens < ?',
  );
  for (const [testId, newMax] of Object.entries(tokenBumps)) {
    updateTokenStmt.run(newMax, testId, newMax);
  }

  // Auto-seed the agent suite if it doesn't exist (needed for Agent Benchmark panel)
  const agentSuiteExists = ensureDb()
    .prepare("SELECT id FROM test_suites WHERE name = 'Agent Suite'")
    .get();
  if (!agentSuiteExists) {
    seedAgent();
  }

  return dbPath;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDefaultEndpointUrl(): string {
  return DEFAULT_ENDPOINT;
}

export function listEndpoints(): Endpoint[] {
  const rows = ensureDb()
    .prepare('SELECT * FROM endpoints ORDER BY created_at DESC')
    .all() as SqlRow[];
  return rows.map(rowToEndpoint);
}

export function getEndpoint(endpointId: number): Endpoint | null {
  const row = ensureDb()
    .prepare('SELECT * FROM endpoints WHERE id = ?')
    .get(endpointId) as SqlRow | undefined;
  return row ? rowToEndpoint(row) : null;
}

export function createEndpoint(input: EndpointCreateInput): Endpoint {
  const statement = ensureDb().prepare(
    'INSERT INTO endpoints (name, base_url, api_key) VALUES (?, ?, ?)',
  );
  const result = statement.run(
    input.name,
    input.base_url,
    input.api_key ?? 'lm-studio',
  );
  const row = ensureDb()
    .prepare('SELECT * FROM endpoints WHERE id = ?')
    .get(result.lastInsertRowid) as SqlRow;
  return rowToEndpoint(row);
}

export function updateEndpoint(
  endpointId: number,
  input: EndpointUpdateInput,
): Endpoint {
  const existing = getEndpoint(endpointId);
  if (!existing) {
    throw new Error('Endpoint not found');
  }

  const assignments: string[] = [];
  const values: Array<string | number> = [];
  if (input.name !== undefined) {
    assignments.push('name = ?');
    values.push(input.name);
  }
  if (input.base_url !== undefined) {
    assignments.push('base_url = ?');
    values.push(input.base_url);
  }
  if (input.api_key !== undefined) {
    assignments.push('api_key = ?');
    values.push(input.api_key);
  }
  if (input.is_active !== undefined) {
    assignments.push('is_active = ?');
    values.push(input.is_active ? 1 : 0);
  }

  if (assignments.length > 0) {
    ensureDb()
      .prepare(`UPDATE endpoints SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...values, endpointId);
  }

  return getEndpoint(endpointId)!;
}

export function deleteEndpoint(endpointId: number): void {
  const result = ensureDb()
    .prepare('DELETE FROM endpoints WHERE id = ?')
    .run(endpointId);
  if (result.changes === 0) {
    throw new Error('Endpoint not found');
  }
}

function hydrateSuites(rows: SqlRow[]): TestSuite[] {
  const selectCases = ensureDb().prepare(
    'SELECT * FROM test_cases WHERE suite_id = ? ORDER BY sort_order',
  );
  return rows.map((row) => {
    const suite = rowToSuite(row);
    const cases = selectCases.all(suite.id) as SqlRow[];
    suite.cases = cases.map(rowToCase);
    return suite;
  });
}

export function listSuites(): TestSuite[] {
  const rows = ensureDb()
    .prepare(
      'SELECT * FROM test_suites ORDER BY is_default DESC, created_at DESC',
    )
    .all() as SqlRow[];
  return hydrateSuites(rows);
}

export function getSuite(suiteId: number): TestSuite | null {
  const row = ensureDb()
    .prepare('SELECT * FROM test_suites WHERE id = ?')
    .get(suiteId) as SqlRow | undefined;
  if (!row) {
    return null;
  }
  return hydrateSuites([row])[0] ?? null;
}

export function createSuite(input: TestSuiteCreateInput): TestSuite {
  const result = ensureDb()
    .prepare('INSERT INTO test_suites (name, description) VALUES (?, ?)')
    .run(input.name, input.description ?? '');
  return getSuite(Number(result.lastInsertRowid))!;
}

export function deleteSuite(suiteId: number): void {
  const result = ensureDb()
    .prepare('DELETE FROM test_suites WHERE id = ?')
    .run(suiteId);
  if (result.changes === 0) {
    throw new Error('Suite not found');
  }
}

export function createCase(
  suiteId: number,
  input: TestCaseCreateInput,
): TestCase {
  const suite = getSuite(suiteId);
  if (!suite) {
    throw new Error('Suite not found');
  }

  const result = ensureDb()
    .prepare(
      `INSERT INTO test_cases (
        suite_id, test_id, category, name, system_prompt, user_prompt,
        eval_keywords, eval_anti, eval_json, eval_sentence_count,
        eval_regex, eval_min_length, max_tokens, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      suiteId,
      input.test_id,
      input.category,
      input.name,
      input.system_prompt,
      input.user_prompt,
      JSON.stringify(input.eval_keywords ?? []),
      JSON.stringify(input.eval_anti ?? []),
      input.eval_json ? 1 : 0,
      input.eval_sentence_count ?? null,
      JSON.stringify(input.eval_regex ?? []),
      input.eval_min_length ?? null,
      input.max_tokens ?? 600,
      input.sort_order ?? suite.cases.length,
    );

  const row = ensureDb()
    .prepare('SELECT * FROM test_cases WHERE id = ?')
    .get(result.lastInsertRowid) as SqlRow;
  return rowToCase(row);
}

export function updateCase(
  suiteId: number,
  caseId: number,
  input: TestCaseUpdateInput,
): TestCase {
  const existing = ensureDb()
    .prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?')
    .get(caseId, suiteId) as SqlRow | undefined;
  if (!existing) {
    throw new Error('Test case not found');
  }

  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  const pushAssignment = (
    key: string,
    value: string | number | null,
  ): void => {
    assignments.push(`${key} = ?`);
    values.push(value);
  };

  if (input.test_id !== undefined) pushAssignment('test_id', input.test_id);
  if (input.category !== undefined) pushAssignment('category', input.category);
  if (input.name !== undefined) pushAssignment('name', input.name);
  if (input.system_prompt !== undefined) {
    pushAssignment('system_prompt', input.system_prompt);
  }
  if (input.user_prompt !== undefined) {
    pushAssignment('user_prompt', input.user_prompt);
  }
  if (input.eval_keywords !== undefined) {
    pushAssignment('eval_keywords', JSON.stringify(input.eval_keywords));
  }
  if (input.eval_anti !== undefined) {
    pushAssignment('eval_anti', JSON.stringify(input.eval_anti));
  }
  if (input.eval_json !== undefined) {
    pushAssignment('eval_json', input.eval_json ? 1 : 0);
  }
  if (input.eval_sentence_count !== undefined) {
    pushAssignment('eval_sentence_count', input.eval_sentence_count ?? null);
  }
  if (input.eval_regex !== undefined) {
    pushAssignment('eval_regex', JSON.stringify(input.eval_regex));
  }
  if (input.eval_min_length !== undefined) {
    pushAssignment('eval_min_length', input.eval_min_length ?? null);
  }
  if (input.max_tokens !== undefined) {
    pushAssignment('max_tokens', input.max_tokens);
  }
  if (input.sort_order !== undefined) {
    pushAssignment('sort_order', input.sort_order);
  }

  if (assignments.length > 0) {
    ensureDb()
      .prepare(`UPDATE test_cases SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...values, caseId);
  }

  const row = ensureDb()
    .prepare('SELECT * FROM test_cases WHERE id = ?')
    .get(caseId) as SqlRow;
  return rowToCase(row);
}

export function deleteCase(suiteId: number, caseId: number): void {
  const result = ensureDb()
    .prepare('DELETE FROM test_cases WHERE id = ? AND suite_id = ?')
    .run(caseId, suiteId);
  if (result.changes === 0) {
    throw new Error('Test case not found');
  }
}

function insertSuiteDefinition(key: keyof SuiteCatalog): SeedSuiteResponse {
  const metadata = SUITE_METADATA[key];
  const existing = ensureDb()
    .prepare('SELECT id FROM test_suites WHERE name = ?')
    .get(metadata.name) as { id: number } | undefined;
  if (existing) {
    return {
      message: `Suite '${metadata.name}' already exists`,
      suite_id: existing.id,
    };
  }

  const suiteResult = ensureDb()
    .prepare(
      'INSERT INTO test_suites (name, description, is_default) VALUES (?, ?, ?)',
    )
    .run(metadata.name, metadata.description, metadata.isDefault ? 1 : 0);

  const suiteId = Number(suiteResult.lastInsertRowid);
  const insertCase = ensureDb().prepare(
    `INSERT INTO test_cases (
      suite_id, test_id, category, name, system_prompt, user_prompt,
      eval_keywords, eval_anti, eval_json, eval_sentence_count,
      eval_regex, eval_min_length, max_tokens, sort_order,
      is_agent_task, tool_hints, expected_tool_calls
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  (suiteCatalog[key] as Array<SuiteDefinition | AgentSuiteDefinition>).forEach((test, index) => {
    const agentTest = test as AgentSuiteDefinition;
    insertCase.run(
      suiteId,
      test.test_id,
      test.category,
      test.name,
      test.system_prompt,
      test.user_prompt,
      JSON.stringify(test.eval_keywords ?? []),
      JSON.stringify(test.eval_anti ?? []),
      test.eval_json ? 1 : 0,
      test.eval_sentence_count ?? null,
      JSON.stringify(test.eval_regex ?? []),
      test.eval_min_length ?? null,
      test.max_tokens,
      index,
      agentTest.is_agent_task ? 1 : 0,
      JSON.stringify(agentTest.tool_hints ?? []),
      agentTest.expected_tool_calls ?? 0,
    );
  });

  return {
    message: `Seeded ${suiteCatalog[key].length} tests in '${metadata.name}'`,
    suite_id: suiteId,
  };
}

export function seedDefaults(): SeedSuiteResponse {
  return insertSuiteDefinition('defaults');
}

export function seedStandard(): SeedSuiteResponse {
  return insertSuiteDefinition('standard');
}

export function seedStress(): SeedSuiteResponse {
  return insertSuiteDefinition('stress');
}

export function seedSpeed(): SeedSuiteResponse {
  return insertSuiteDefinition('speed');
}

export function seedJudgment(): SeedSuiteResponse {
  return insertSuiteDefinition('judgment');
}

export function seedCreator(): SeedSuiteResponse {
  return insertSuiteDefinition('creator');
}

export function seedAgent(): SeedSuiteResponse {
  return insertSuiteDefinition('agent');
}

export function createBenchmarkRun(request: BenchmarkRunRequest): number {
  const now = getNowIso();
  const result = ensureDb()
    .prepare(
      `INSERT INTO benchmark_runs (
        endpoint_id, suite_id, model_id, model_name, is_thinking, is_agent_run, status, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
    )
    .run(
      request.endpoint_id,
      request.suite_id,
      request.model_id,
      request.model_name,
      request.is_thinking ? 1 : 0,
      request.is_agent_run ? 1 : 0,
      now,
    );
  return Number(result.lastInsertRowid);
}

export function insertTestResult(
  runId: number,
  result: BenchmarkTestDone,
): number {
  const inserted = ensureDb()
    .prepare(
      `INSERT INTO test_results (
        run_id, test_case_id, test_id, category, name, content, elapsed_s,
        prompt_tokens, completion_tokens, tokens_per_sec, finish_reason,
        final_score, keyword_score, keyword_hits, keyword_misses, violations,
        had_thinking, thinking_tokens_approx, answer_length,
        tool_calls_made, tool_calls_correct, tool_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      runId,
      result.test_case_id,
      result.test_id,
      result.category,
      result.name,
      result.content,
      result.elapsed_s,
      result.prompt_tokens,
      result.completion_tokens,
      result.tokens_per_sec,
      result.finish_reason,
      result.final_score,
      result.keyword_score,
      JSON.stringify(result.keyword_hits),
      JSON.stringify(result.keyword_misses),
      JSON.stringify(result.violations),
      result.had_thinking ? 1 : 0,
      result.thinking_tokens_approx,
      result.answer_length,
      result.tool_calls_made ?? 0,
      result.tool_calls_correct ?? 0,
      result.tool_score ?? 0,
    );
  return Number(inserted.lastInsertRowid);
}

export function completeBenchmarkRun(
  runId: number,
  summary: BenchmarkSummary,
): void {
  ensureDb()
    .prepare(
      `UPDATE benchmark_runs
       SET status = 'completed', avg_score = ?, avg_tps = ?, total_time_s = ?, completed_at = ?
       WHERE id = ?`,
    )
    .run(
      summary.avg_score,
      summary.avg_tps,
      summary.total_time_s,
      getNowIso(),
      runId,
    );
}

export function failBenchmarkRun(
  runId: number,
  status: 'failed' | 'cancelled',
): void {
  ensureDb()
    .prepare(
      'UPDATE benchmark_runs SET status = ?, completed_at = ? WHERE id = ?',
    )
    .run(status, getNowIso(), runId);
}

export function listRuns(): BenchmarkRun[] {
  const rows = ensureDb()
    .prepare('SELECT * FROM benchmark_runs ORDER BY started_at DESC')
    .all() as SqlRow[];
  return rows.map(rowToRun);
}

export function getRun(runId: number): BenchmarkRun | null {
  const row = ensureDb()
    .prepare('SELECT * FROM benchmark_runs WHERE id = ?')
    .get(runId) as SqlRow | undefined;
  if (!row) {
    return null;
  }
  const run = rowToRun(row);
  const resultRows = ensureDb()
    .prepare('SELECT * FROM test_results WHERE run_id = ?')
    .all(runId) as SqlRow[];
  run.results = resultRows.map(rowToResult);
  return run;
}

export function compareRuns(runIds: number[]): BenchmarkRun[] {
  return runIds.map((runId) => {
    const run = getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }
    return run;
  });
}

export function deleteRun(runId: number): void {
  const result = ensureDb()
    .prepare('DELETE FROM benchmark_runs WHERE id = ?')
    .run(runId);
  if (result.changes === 0) {
    throw new Error('Run not found');
  }
}

export function buildExportContent(
  runId: number,
  format: 'json' | 'csv' | 'md',
): string {
  const run = getRun(runId);
  if (!run) {
    throw new Error('Run not found');
  }

  if (format === 'json') {
    return JSON.stringify(run, null, 2);
  }

  if (format === 'csv') {
    const lines = [
      'test_id,category,name,final_score,tokens_per_sec,elapsed_s,keyword_score,had_thinking,finish_reason',
    ];
    for (const result of run.results) {
      const columns = [
        result.test_id,
        result.category,
        result.name,
        result.final_score,
        result.tokens_per_sec,
        result.elapsed_s,
        result.keyword_score,
        result.had_thinking,
        result.finish_reason ?? '',
      ];
      lines.push(
        columns
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(','),
      );
    }
    return lines.join('\n');
  }

  const lines = [
    `# Benchmark Run #${run.id}`,
    `**Model:** ${run.model_name} (\`${run.model_id}\`)`,
    `**Score:** ${run.avg_score} | **Speed:** ${run.avg_tps} t/s | **Time:** ${run.total_time_s}s`,
    `**Status:** ${run.status} | **Date:** ${run.started_at}`,
    '',
    '| Test | Category | Score | t/s | Time |',
    '|------|----------|-------|-----|------|',
  ];
  for (const result of run.results) {
    lines.push(
      `| ${result.name} | ${result.category} | ${result.final_score} | ${result.tokens_per_sec} | ${result.elapsed_s}s |`,
    );
  }
  return lines.join('\n');
}

export function getSuiteCases(suiteId: number): TestCase[] {
  const rows = ensureDb()
    .prepare('SELECT * FROM test_cases WHERE suite_id = ? ORDER BY sort_order')
    .all(suiteId) as SqlRow[];
  return rows.map(rowToCase);
}

export function importLegacyRun(filePath: string): ImportLegacyResponse {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as {
    models?: Record<string, string>;
    results?: Record<string, Array<Record<string, unknown>>>;
  };

  const defaultSuite = ensureDb()
    .prepare('SELECT id FROM test_suites WHERE is_default = 1')
    .get() as { id: number } | undefined;
  if (!defaultSuite) {
    throw new Error('Seed default tests first');
  }

  const endpoint = ensureDb()
    .prepare('SELECT id FROM endpoints LIMIT 1')
    .get() as { id: number } | undefined;
  if (!endpoint) {
    throw new Error('Create an endpoint first');
  }

  const insertRun = ensureDb().prepare(
    `INSERT INTO benchmark_runs (
      endpoint_id, suite_id, model_id, model_name, is_thinking, status,
      avg_score, avg_tps, total_time_s, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
  );

  const findCase = ensureDb().prepare(
    'SELECT id FROM test_cases WHERE suite_id = ? AND test_id = ?',
  );
  const insertResult = ensureDb().prepare(
    `INSERT INTO test_results (
      run_id, test_case_id, test_id, category, name, content, elapsed_s,
      prompt_tokens, completion_tokens, tokens_per_sec, finish_reason,
      final_score, keyword_score, keyword_hits, keyword_misses, violations,
      had_thinking, thinking_tokens_approx, answer_length
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const imported: ImportLegacyResponse['imported'] = [];
  for (const [modelName, results] of Object.entries(parsed.results ?? {})) {
    const modelId = parsed.models?.[modelName] ?? modelName;
    const scores = results.map((result) => Number(result.final_score ?? 0));
    const tps = results.map((result) => Number(result.tokens_per_sec ?? 0));
    const times = results.map((result) => Number(result.elapsed_s ?? 0));
    const now = getNowIso();

    const runResult = insertRun.run(
      endpoint.id,
      defaultSuite.id,
      modelId,
      modelName,
      0,
      scores.length > 0
        ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2))
        : 0,
      tps.length > 0
        ? Number((tps.reduce((sum, value) => sum + value, 0) / tps.length).toFixed(1))
        : 0,
      Number(times.reduce((sum, value) => sum + value, 0).toFixed(2)),
      now,
      now,
    );

    const runId = Number(runResult.lastInsertRowid);
    for (const result of results) {
      const caseRow = findCase.get(
        defaultSuite.id,
        String(result.test_id ?? ''),
      ) as { id: number } | undefined;

      insertResult.run(
        runId,
        caseRow?.id ?? 0,
        String(result.test_id ?? ''),
        String(result.category ?? ''),
        String(result.name ?? ''),
        String(result.content ?? ''),
        Number(result.elapsed_s ?? 0),
        Number(result.prompt_tokens ?? 0),
        Number(result.completion_tokens ?? 0),
        Number(result.tokens_per_sec ?? 0),
        result.finish_reason ? String(result.finish_reason) : null,
        Number(result.final_score ?? 0),
        Number(result.keyword_score ?? 0),
        JSON.stringify(result.keyword_hits ?? []),
        JSON.stringify(result.keyword_misses ?? []),
        JSON.stringify(result.violations ?? []),
        result.had_thinking ? 1 : 0,
        Number(result.thinking_tokens_approx ?? 0),
        Number(result.answer_length ?? 0),
      );
    }

    imported.push({ run_id: runId, model: modelName, tests: results.length });
  }

  return { imported };
}
