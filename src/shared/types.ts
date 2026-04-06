export interface Endpoint {
  id: number;
  name: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
}

export interface EndpointCreateInput {
  name: string;
  base_url: string;
  api_key?: string;
}

export interface EndpointUpdateInput {
  name?: string;
  base_url?: string;
  api_key?: string;
  is_active?: boolean;
}

export interface ModelInfo {
  id: string;
  object: string;
}

export interface TestCase {
  id: number;
  suite_id: number;
  test_id: string;
  category: string;
  name: string;
  system_prompt: string;
  user_prompt: string;
  eval_keywords: string[];
  eval_anti: string[];
  eval_json: boolean;
  eval_sentence_count: number | null;
  eval_regex: string[];
  eval_min_length: number | null;
  max_tokens: number;
  sort_order: number;
  is_agent_task: boolean;
  tool_hints: string[];
  expected_tool_calls: number;
}

export interface TestSuite {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  created_at: string;
  cases: TestCase[];
}

export interface TestSuiteCreateInput {
  name: string;
  description?: string;
}

export interface TestCaseCreateInput {
  test_id: string;
  category: string;
  name: string;
  system_prompt: string;
  user_prompt: string;
  eval_keywords?: string[];
  eval_anti?: string[];
  eval_json?: boolean;
  eval_sentence_count?: number | null;
  eval_regex?: string[];
  eval_min_length?: number | null;
  max_tokens?: number;
  sort_order?: number;
}

export interface TestCaseUpdateInput {
  test_id?: string;
  category?: string;
  name?: string;
  system_prompt?: string;
  user_prompt?: string;
  eval_keywords?: string[];
  eval_anti?: string[];
  eval_json?: boolean;
  eval_sentence_count?: number | null;
  eval_regex?: string[];
  eval_min_length?: number | null;
  max_tokens?: number;
  sort_order?: number;
}

export interface BenchmarkRunRequest {
  endpoint_id: number;
  suite_id: number;
  model_id: string;
  model_name: string;
  is_thinking?: boolean;
  is_agent_run?: boolean;
}

export interface TestResult {
  id: number;
  run_id: number;
  test_case_id: number;
  test_id: string;
  category: string;
  name: string;
  content: string;
  elapsed_s: number;
  prompt_tokens: number;
  completion_tokens: number;
  tokens_per_sec: number;
  finish_reason: string | null;
  final_score: number;
  keyword_score: number;
  keyword_hits: string[];
  keyword_misses: string[];
  violations: string[];
  had_thinking: boolean;
  thinking_tokens_approx: number;
  answer_length: number;
  tool_calls_made: number;
  tool_calls_correct: number;
  tool_score: number;
}

export interface BenchmarkRun {
  id: number;
  endpoint_id: number;
  suite_id: number;
  model_id: string;
  model_name: string;
  is_thinking: boolean;
  is_agent_run: boolean;
  status: string;
  avg_score: number | null;
  avg_tps: number | null;
  total_time_s: number | null;
  started_at: string | null;
  completed_at: string | null;
  results: TestResult[];
}

export interface BenchmarkRunStartResponse {
  run_id: number;
  status: 'running';
}

export interface ImportRunRecord {
  run_id: number;
  model: string;
  tests: number;
}

export interface ImportLegacyResponse {
  imported: ImportRunRecord[];
}

export type ExportFormat = 'json' | 'csv' | 'md';

export interface ExportRunResponse {
  ok: boolean;
  path?: string;
  cancelled?: boolean;
}

export interface CompareRunsResponse {
  runs: BenchmarkRun[];
}

export interface SeedSuiteResponse {
  message: string;
  suite_id: number;
}

export interface ApiMessageResponse {
  message: string;
}

export interface BenchmarkStarted {
  run_id: number;
  model: string;
  total_tests: number;
}

export interface BenchmarkTestStart {
  run_id: number;
  test_index: number;
  test_id: string;
  name: string;
}

export interface BenchmarkTestDone extends TestResult {
  run_id: number;
  test_index: number;
  error: string | null;
}

export interface BenchmarkSummary {
  run_id: number;
  avg_score: number;
  avg_tps: number;
  total_time_s: number;
}

export interface BenchmarkErrorEvent {
  run_id: number;
  error: string;
}

export type BenchmarkStreamEventName =
  | 'started'
  | 'test_start'
  | 'test_done'
  | 'summary'
  | 'done'
  | 'error'
  | 'cancelled';

export type BenchmarkStreamEventData =
  | BenchmarkStarted
  | BenchmarkTestStart
  | BenchmarkTestDone
  | BenchmarkSummary
  | BenchmarkErrorEvent
  | { run_id: number };

export interface BenchmarkStreamEvent {
  run_id: number;
  event: BenchmarkStreamEventName;
  data: BenchmarkStreamEventData;
}

export interface SuiteDefinition extends Omit<TestCaseCreateInput, 'sort_order'> {
  max_tokens: number;
}

export interface AgentSuiteDefinition extends SuiteDefinition {
  is_agent_task: boolean;
  tool_hints: string[];
  expected_tool_calls: number;
}

// --- Agent Chat Types ---

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
  isStreaming?: boolean;
}

export interface AgentConversation {
  id: string;
  name: string;
  messages: AgentChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type AgentStreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; toolCall: AgentToolCall }
  | { type: 'tool_call_done'; toolCallId: string; result?: unknown; error?: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface AgentSendRequest {
  endpointId: number;
  modelId: string;
  messages: AgentChatMessage[];
  enableTools: boolean;
}

export interface SetupCheckResult {
  component: string;
  installed: boolean;
  version?: string;
  error?: string;
}

// --- Agent Benchmark Types ---

export interface AgentBenchmarkTask {
  task_id: string;
  name: string;
  prompt: string;
  category: string;
}

export interface AgentBenchmarkStarted {
  run_id: number;
  suite_name: string;
  model_name: string;
  total_tasks: number;
}

export interface AgentBenchmarkTaskStart {
  run_id: number;
  task_index: number;
  task_id: string;
  name: string;
  prompt: string;
  category: string;
}

export interface AgentBenchmarkTextDelta {
  run_id: number;
  task_index: number;
  content: string;
}

export interface AgentBenchmarkToolCall {
  run_id: number;
  task_index: number;
  tool_call: AgentToolCall;
}

export interface AgentBenchmarkToolDone {
  run_id: number;
  task_index: number;
  tool_call_id: string;
  result?: unknown;
  error?: string;
}

export interface AgentBenchmarkTaskDone {
  run_id: number;
  task_index: number;
  task_id: string;
  name: string;
  category: string;
  score: number;
  tool_calls_made: number;
  tools_used: string[];
  elapsed_s: number;
  error: string | null;
}

export interface AgentBenchmarkSummary {
  run_id: number;
  avg_score: number;
  total_tool_calls: number;
  total_time_s: number;
  tool_distribution: Record<string, number>;
}

export type AgentBenchmarkStreamEventName =
  | 'started'
  | 'task_start'
  | 'text_delta'
  | 'tool_call_start'
  | 'tool_call_done'
  | 'task_done'
  | 'summary'
  | 'done'
  | 'error'
  | 'cancelled';

export type AgentBenchmarkStreamEventData =
  | AgentBenchmarkStarted
  | AgentBenchmarkTaskStart
  | AgentBenchmarkTextDelta
  | AgentBenchmarkToolCall
  | AgentBenchmarkToolDone
  | AgentBenchmarkTaskDone
  | AgentBenchmarkSummary
  | { run_id: number; error?: string };

export interface AgentBenchmarkStreamEvent {
  run_id: number;
  event: AgentBenchmarkStreamEventName;
  data: AgentBenchmarkStreamEventData;
}

export interface CompletedAgentTask {
  task_id: string;
  name: string;
  category: string;
  score: number;
  tool_calls_made: number;
  tools_used: string[];
  elapsed_s: number;
  error: string | null;
}

export interface LiveAgentTask {
  task_id: string;
  name: string;
  prompt: string;
  category: string;
  textSoFar: string;
  toolCalls: AgentToolCall[];
}

// --- Arena Battle Types ---

export type BattlePhase = 'configuring' | 'building' | 'judging' | 'results';
export type BattleStatus = 'active' | 'completed' | 'cancelled';
export type CompetitorStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dnf';

export interface Battle {
  id: string;
  prompt: string;
  presetId?: string;
  phase: BattlePhase;
  status: BattleStatus;
  competitors: BattleCompetitor[];
  winnerId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface BattleCompetitor {
  id: string;
  battleId: string;
  endpointId: number;
  modelId: string;
  status: CompetitorStatus;
  outputDir: string;
  startTime?: string;
  endTime?: string;
  score?: number;
  eloChange?: number;
}

export interface MetricResult {
  name: string;
  score: number; // 0-100
  details?: string;
  weight: number;
}

export interface EloRating {
  modelKey: string;
  rating: number; // default 1500
  wins: number;
  losses: number;
  draws: number;
  battleCount: number;
  lastUpdated: string;
}

export type BattleEvent =
  | { type: 'competitor_start'; competitorId: string; modelId: string }
  | { type: 'text_delta'; competitorId: string; content: string }
  | { type: 'tool_call'; competitorId: string; toolCall: AgentToolCall }
  | { type: 'file_written'; competitorId: string; filename: string; path: string }
  | { type: 'competitor_done'; competitorId: string; status: CompetitorStatus }
  | { type: 'battle_done'; battleId: string; phase: BattlePhase }
  | { type: 'metrics_ready'; competitorId: string; metrics: MetricResult[] }
  | { type: 'error'; competitorId?: string; message: string };

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard';

export interface PresetChallenge {
  id: string;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  systemPromptAddendum: string;
}
