import type { TestCaseCreateInput } from '../../shared/types';
import { stripThinking } from './thinking';

export interface ScoreResult {
  keyword_score: number;
  keyword_hits: string[];
  keyword_misses: string[];
  violations: string[];
  final_score: number;
  had_thinking: boolean;
  thinking_tokens_approx: number;
  answer_length: number;
}

export function scoreResponse(
  test: Pick<
    TestCaseCreateInput,
    | 'eval_keywords'
    | 'eval_anti'
    | 'eval_json'
    | 'eval_sentence_count'
    | 'eval_regex'
    | 'eval_min_length'
  >,
  response: string,
): ScoreResult {
  const [cleaned, thinking] = stripThinking(response);
  const hadThinking = thinking.length > 50;
  const evalText = cleaned || response;
  const evalLower = evalText.toLowerCase();

  const hits: string[] = [];
  const misses: string[] = [];
  for (const keyword of test.eval_keywords ?? []) {
    if (evalLower.includes(keyword.toLowerCase())) {
      hits.push(keyword);
    } else {
      misses.push(keyword);
    }
  }

  const violations: string[] = [];
  for (const antiKeyword of test.eval_anti ?? []) {
    if (evalLower.includes(antiKeyword.toLowerCase())) {
      violations.push(antiKeyword);
    }
  }

  const keywordTotal = (test.eval_keywords ?? []).length;
  const keywordScore = keywordTotal > 0 ? hits.length / keywordTotal : 1;
  const antiPenalty = violations.length * 0.2;

  const regexPatterns = test.eval_regex ?? [];
  let regexScore = 0;
  if (regexPatterns.length > 0) {
    let regexHits = 0;
    for (const pattern of regexPatterns) {
      try {
        if (new RegExp(pattern, 's').test(evalText)) {
          regexHits += 1;
        }
      } catch {
        // Ignore invalid patterns to preserve compatibility with existing data.
      }
    }
    regexScore = regexHits / regexPatterns.length;
  }

  const baseScore =
    regexPatterns.length > 0 ? (keywordScore + regexScore) / 2 : keywordScore;

  let jsonBonus = 0;
  if (test.eval_json) {
    try {
      let jsonText = evalText.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
      }
      JSON.parse(jsonText);
      jsonBonus = 0.1;
    } catch {
      // no-op
    }
  }

  let sentenceBonus = 0;
  if (test.eval_sentence_count) {
    const sentences = evalText
      .split(/[.!?]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    if (sentences.length === test.eval_sentence_count) {
      sentenceBonus = 0.3;
    } else if (
      Math.abs(sentences.length - test.eval_sentence_count) <= 1
    ) {
      sentenceBonus = 0.1;
    }
  }

  const truncationPenalty = !cleaned && hadThinking ? 0.5 : 0;
  const lengthPenalty =
    test.eval_min_length && evalText.length < test.eval_min_length ? 0.3 : 0;

  const finalScore = Math.min(
    1,
    Math.max(
      0,
      baseScore -
        antiPenalty +
        jsonBonus +
        sentenceBonus -
        truncationPenalty -
        lengthPenalty,
    ),
  );

  return {
    keyword_score: Number(keywordScore.toFixed(2)),
    keyword_hits: hits,
    keyword_misses: misses,
    violations,
    final_score: Number(finalScore.toFixed(2)),
    had_thinking: hadThinking,
    thinking_tokens_approx: thinking ? thinking.split(/\s+/).length : 0,
    answer_length: cleaned.length,
  };
}
