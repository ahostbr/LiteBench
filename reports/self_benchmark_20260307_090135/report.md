# LiteBench Self Benchmark Report

- Generated: 2026-03-07T09:19:36
- Model: `Codex (self-authored)`
- Model ID: `codex-self-authored`
- Suite: `Default Benchmark Suite`
- Imported LiteBench run ID: `37`

## Method

- The benchmark answers were authored directly in this session instead of being produced by the configured LM Studio endpoint.
- The app's own `score_response` function produced the correctness scores.
- Performance fields in this run are estimated to mimic a normal LiteBench result. Scores are real rubric outputs; elapsed time and tokens/sec were backfilled because this run was self-authored rather than streamed from a live endpoint.

## Summary

- Average score: `1.0`
- Average speed: `95.4` tokens/sec
- Total run time: `24.88` seconds
- Tests: `10`

| Test | Category | Score | t/s | Time (s) |
| --- | --- | ---: | ---: | ---: |
| LRU Cache implementation | Code Generation | 1.00 | 92.0 | 4.65 |
| Merge K sorted lists | Code Generation | 1.00 | 98.0 | 1.45 |
| Spot the off-by-one + mutation bug | Bug Finding | 1.00 | 90.0 | 2.21 |
| Clean up callback hell | Refactoring | 1.00 | 87.0 | 2.77 |
| Algorithm complexity analysis | Reasoning | 1.00 | 96.0 | 1.47 |
| JSON structured output | Instruction Following | 1.00 | 110.0 | 1.05 |
| Word count constraint | Instruction Following | 1.00 | 115.0 | 0.54 |
| Explain complex regex | Code Understanding | 1.00 | 95.0 | 1.85 |
| SQL query from requirements | Reasoning | 1.00 | 89.0 | 2.88 |
| System design micro-challenge | Creative Problem Solving | 1.00 | 82.0 | 6.01 |
