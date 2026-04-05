import OpenAI from 'openai';
import type {
  BenchmarkRunRequest,
  BenchmarkStreamEvent,
  BenchmarkSummary,
  BenchmarkTestDone,
  BenchmarkTestStart,
  BenchmarkStarted,
  Endpoint,
  TestCase,
} from '../../shared/types';
import { scoreResponse } from './scorer';

export interface ModelCallResult {
  content: string;
  elapsed_s: number;
  prompt_tokens: number;
  completion_tokens: number;
  tokens_per_sec: number;
  finish_reason: string | null;
  error: string | null;
}

export interface BenchmarkEngineContext {
  endpoint: Endpoint;
  run_id: number;
  request: Required<Pick<BenchmarkRunRequest, 'model_id' | 'model_name'>> &
    BenchmarkRunRequest;
  testCases: TestCase[];
  isCancelled: () => boolean;
  onEvent: (event: BenchmarkStreamEvent) => Promise<void> | void;
}

export async function callModel(
  client: OpenAI,
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  isThinking: boolean,
): Promise<ModelCallResult> {
  const effectiveMaxTokens = isThinking ? maxTokens * 5 : maxTokens;
  const startedAt = performance.now();

  try {
    const response = await client.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: effectiveMaxTokens,
      temperature: 0.3,
    });

    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    const content = response.choices[0]?.message?.content ?? '';
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;

    return {
      content,
      elapsed_s: Number(elapsedSeconds.toFixed(2)),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      tokens_per_sec:
        completionTokens > 0 && elapsedSeconds > 0
          ? Number((completionTokens / elapsedSeconds).toFixed(1))
          : 0,
      finish_reason: response.choices[0]?.finish_reason ?? null,
      error: null,
    };
  } catch (error) {
    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    return {
      content: '',
      elapsed_s: Number(elapsedSeconds.toFixed(2)),
      prompt_tokens: 0,
      completion_tokens: 0,
      tokens_per_sec: 0,
      finish_reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runBenchmarkStream(
  context: BenchmarkEngineContext,
): Promise<{
  summary: BenchmarkSummary | null;
  completedTests: BenchmarkTestDone[];
  cancelled: boolean;
}> {
  const client = new OpenAI({
    apiKey: context.endpoint.api_key,
    baseURL: context.endpoint.base_url,
    timeout: 120_000,
  });

  const startedEvent: BenchmarkStarted = {
    run_id: context.run_id,
    model: context.request.model_id,
    total_tests: context.testCases.length,
  };

  await context.onEvent({
    run_id: context.run_id,
    event: 'started',
    data: startedEvent,
  });

  const completedTests: BenchmarkTestDone[] = [];
  let totalTime = 0;
  let totalScore = 0;
  let totalTps = 0;

  for (const [testIndex, testCase] of context.testCases.entries()) {
    if (context.isCancelled()) {
      return { summary: null, completedTests, cancelled: true };
    }

    const testStart: BenchmarkTestStart = {
      run_id: context.run_id,
      test_index: testIndex,
      test_id: testCase.test_id,
      name: testCase.name,
    };

    await context.onEvent({
      run_id: context.run_id,
      event: 'test_start',
      data: testStart,
    });

    const modelResult = await callModel(
      client,
      context.request.model_id,
      testCase.system_prompt,
      testCase.user_prompt,
      testCase.max_tokens,
      Boolean(context.request.is_thinking),
    );

    if (context.isCancelled()) {
      return { summary: null, completedTests, cancelled: true };
    }

    const score = scoreResponse(testCase, modelResult.content);
    const completed: BenchmarkTestDone = {
      id: 0,
      run_id: context.run_id,
      test_case_id: testCase.id,
      test_id: testCase.test_id,
      category: testCase.category,
      name: testCase.name,
      content: modelResult.content,
      elapsed_s: modelResult.elapsed_s,
      prompt_tokens: modelResult.prompt_tokens,
      completion_tokens: modelResult.completion_tokens,
      tokens_per_sec: modelResult.tokens_per_sec,
      finish_reason: modelResult.finish_reason,
      final_score: score.final_score,
      keyword_score: score.keyword_score,
      keyword_hits: score.keyword_hits,
      keyword_misses: score.keyword_misses,
      violations: score.violations,
      had_thinking: score.had_thinking,
      thinking_tokens_approx: score.thinking_tokens_approx,
      answer_length: score.answer_length,
      test_index: testIndex,
      error: modelResult.error,
      tool_calls_made: 0,
      tool_calls_correct: 0,
      tool_score: 0,
    };

    completedTests.push(completed);
    totalTime += completed.elapsed_s;
    totalScore += completed.final_score;
    totalTps += completed.tokens_per_sec;

    await context.onEvent({
      run_id: context.run_id,
      event: 'test_done',
      data: completed,
    });
  }

  const summary: BenchmarkSummary = {
    run_id: context.run_id,
    avg_score:
      completedTests.length > 0
        ? Number((totalScore / completedTests.length).toFixed(2))
        : 0,
    avg_tps:
      completedTests.length > 0
        ? Number((totalTps / completedTests.length).toFixed(1))
        : 0,
    total_time_s: Number(totalTime.toFixed(2)),
  };

  await context.onEvent({
    run_id: context.run_id,
    event: 'summary',
    data: summary,
  });
  await context.onEvent({
    run_id: context.run_id,
    event: 'done',
    data: { run_id: context.run_id },
  });

  return { summary, completedTests, cancelled: false };
}
