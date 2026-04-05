import OpenAI from 'openai';
import type {
  AgentChatMessage,
  AgentToolCall,
  BenchmarkStarted,
  BenchmarkSummary,
  BenchmarkTestDone,
  BenchmarkTestStart,
} from '../../shared/types';
import { streamAgentChat } from './agent-runner';
import type { BenchmarkEngineContext } from './runner';
import { scoreResponse } from './scorer';

/**
 * Runs each test case through the agent loop (streamAgentChat), collecting
 * the final assistant content and all tool calls made. Scores via scoreResponse
 * plus a tool-call accuracy overlay.
 *
 * The BenchmarkEngineContext shape is identical to the standard runner so the
 * same IPC handler can dispatch to either runner based on is_agent_run.
 */
export async function runAgentBenchmarkStream(
  context: BenchmarkEngineContext,
): Promise<{
  summary: BenchmarkSummary | null;
  completedTests: BenchmarkTestDone[];
  cancelled: boolean;
}> {
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

    // Build initial messages for the agent
    const messages: AgentChatMessage[] = [
      {
        id: `sys-${testIndex}`,
        role: 'system',
        content: testCase.system_prompt,
        timestamp: Date.now(),
      },
      {
        id: `usr-${testIndex}`,
        role: 'user',
        content: testCase.user_prompt,
        timestamp: Date.now(),
      },
    ];

    // Collect streaming events from the agent
    let finalContent = '';
    const toolCallsMade: AgentToolCall[] = [];
    let streamError: string | null = null;

    const abortController = new AbortController();

    // Wire cancellation to abort the stream
    const cancelCheck = setInterval(() => {
      if (context.isCancelled()) {
        abortController.abort();
      }
    }, 200);

    const startedAt = performance.now();

    try {
      await streamAgentChat(
        context.endpoint,
        context.request.model_id,
        messages,
        true, // always enable tools for agent benchmarks
        abortController.signal,
        (event) => {
          if (event.type === 'text_delta') {
            finalContent += event.content;
          } else if (event.type === 'tool_call_start') {
            toolCallsMade.push({ ...event.toolCall });
          } else if (event.type === 'tool_call_done') {
            // Update the tool call record with result/error
            const tc = toolCallsMade.find((t) => t.id === event.toolCallId);
            if (tc) {
              tc.result = event.result;
              tc.error = event.error;
              tc.status = event.error ? 'error' : 'success';
              tc.endTime = Date.now();
            }
          } else if (event.type === 'error') {
            streamError = event.message;
          }
        },
      );
    } catch (err) {
      streamError = err instanceof Error ? err.message : String(err);
    } finally {
      clearInterval(cancelCheck);
    }

    if (context.isCancelled()) {
      return { summary: null, completedTests, cancelled: true };
    }

    const elapsed_s = Number(((performance.now() - startedAt) / 1000).toFixed(2));

    // Token counts: we don't have direct usage from streaming, so approximate
    // from content length (good enough for benchmark comparison purposes).
    // If the model returns usage in stream chunks, agent-runner could expose it;
    // for now use word-count heuristic (similar to existing runner for non-streaming).
    const completionTokens = Math.round(finalContent.split(/\s+/).length * 1.3);
    const tokens_per_sec =
      completionTokens > 0 && elapsed_s > 0
        ? Number((completionTokens / elapsed_s).toFixed(1))
        : 0;

    // Score the final text content
    const score = scoreResponse(testCase, finalContent);

    // Tool-call accuracy score: ratio of tool hints actually invoked
    const toolHints = testCase.tool_hints ?? [];
    let toolCallsCorrect = 0;
    if (toolHints.length > 0) {
      const invokedNames = new Set(toolCallsMade.map((tc) => tc.name));
      toolCallsCorrect = toolHints.filter((hint) => invokedNames.has(hint)).length;
    }
    const toolScore =
      toolHints.length > 0
        ? Number((toolCallsCorrect / toolHints.length).toFixed(2))
        : toolCallsMade.length > 0
          ? 1 // called tools even when none expected → neutral positive
          : 1;

    // Blend text score and tool score: 60/40 when tool hints are present
    const blendedFinalScore =
      toolHints.length > 0
        ? Number((score.final_score * 0.6 + toolScore * 0.4).toFixed(2))
        : score.final_score;

    const completed: BenchmarkTestDone = {
      id: 0,
      run_id: context.run_id,
      test_case_id: testCase.id,
      test_id: testCase.test_id,
      category: testCase.category,
      name: testCase.name,
      content: finalContent,
      elapsed_s,
      prompt_tokens: 0, // not available from streaming agent loop
      completion_tokens: completionTokens,
      tokens_per_sec,
      finish_reason: streamError ? 'error' : 'stop',
      final_score: blendedFinalScore,
      keyword_score: score.keyword_score,
      keyword_hits: score.keyword_hits,
      keyword_misses: score.keyword_misses,
      violations: score.violations,
      had_thinking: score.had_thinking,
      thinking_tokens_approx: score.thinking_tokens_approx,
      answer_length: score.answer_length,
      tool_calls_made: toolCallsMade.length,
      tool_calls_correct: toolCallsCorrect,
      tool_score: toolScore,
      test_index: testIndex,
      error: streamError,
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
