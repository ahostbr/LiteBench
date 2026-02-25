export interface Endpoint {
  id: number;
  name: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
}

export interface ModelInfo {
  id: string;
  object: string;
}

export interface TestSuite {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  created_at: string;
  cases: TestCase[];
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
  max_tokens: number;
  sort_order: number;
}

export interface BenchmarkRun {
  id: number;
  endpoint_id: number;
  suite_id: number;
  model_id: string;
  model_name: string;
  is_thinking: boolean;
  status: string;
  avg_score: number | null;
  avg_tps: number | null;
  total_time_s: number | null;
  started_at: string | null;
  completed_at: string | null;
  results: TestResult[];
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
}

// SSE event payloads
export interface SSEStarted {
  run_id: number;
  model: string;
  total_tests: number;
}

export interface SSETestStart {
  run_id: number;
  test_index: number;
  test_id: string;
  name: string;
}

export interface SSETestDone {
  run_id: number;
  test_index: number;
  test_id: string;
  test_case_id: number;
  name: string;
  category: string;
  content: string;
  elapsed_s: number;
  prompt_tokens: number;
  completion_tokens: number;
  tokens_per_sec: number;
  finish_reason: string | null;
  error: string | null;
  final_score: number;
  keyword_score: number;
  keyword_hits: string[];
  keyword_misses: string[];
  violations: string[];
  had_thinking: boolean;
  thinking_tokens_approx: number;
  answer_length: number;
}

export interface SSESummary {
  run_id: number;
  avg_score: number;
  avg_tps: number;
  total_time_s: number;
}
