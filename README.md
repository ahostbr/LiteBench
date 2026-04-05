# LiteBench

**LLM Benchmark Studio** — test local models with practical, real-world tasks.

Point LiteBench at any OpenAI-compatible endpoint (LM Studio, llama.cpp, Ollama, vLLM), pick a test suite, and see which model actually performs better at the things you do every day.

## Features

- **6 Test Suites** — Creator, Standard, Speed, Stress, Judgment, and Multimodal
- **Real-World Tasks** — YouTube hooks, tweet threads, email drafts, code generation, reasoning
- **Side-by-Side Comparison** — Radar charts, heatmaps, win/loss breakdown, speed scatter
- **Winner Card** — Big bold scoreboard with one-click PNG export
- **Live Streaming** — Watch results come in test-by-test via SSE
- **MCP Server** — 4 tools (bench, web_search, web_fetch, youtube) for agent-driven benchmarks
- **Multimodal** — Audio transcription and image understanding tests
- **Fully Local** — Your models, your hardware, your data. Nothing leaves your machine.

## Quick Start

### Desktop App (Electron)

```bash
git clone https://github.com/user/LiteBench.git
cd LiteBench
pnpm install
pnpm dev
```

### Backend (for MCP + API access)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8001
```

### MCP Server (for AI agents)

```bash
cd mcp-server
pip install -r requirements.txt
python server.py
```

## Test Suites

| Suite | Tests | Focus |
|-------|-------|-------|
| **Creator** | 15 | YouTube hooks, tweets, summaries, emails, reasoning |
| **Standard** | 25 | Code generation, architecture, security, multi-language |
| **Speed** | 10 | Fast responses, 150-300 token tests |
| **Stress** | 15 | Long-form output, 2000-4000 tokens |
| **Judgment** | 12 | Common sense, calibration, self-critique |
| **Multimodal** | 12 | Audio transcription, image understanding, cross-modal |

## MCP Tools

The standalone MCP server (`mcp-server/`) provides 4 tools for AI agents:

| Tool | Description |
|------|-------------|
| `bench` | Manage endpoints, suites, runs, comparisons, exports |
| `web_search` | DuckDuckGo search (no API key needed) |
| `web_fetch` | Fetch and extract text from any URL |
| `youtube` | YouTube transcripts and video info via yt-dlp |

### Claude Desktop / Claude Code config

```json
{
  "mcpServers": {
    "litebench": {
      "command": "python",
      "args": ["C:/path/to/LiteBench/mcp-server/server.py"]
    }
  }
}
```

## Architecture

```
LiteBench/
  src/               # Electron app (React + TypeScript)
    main/            # Main process: IPC handlers, benchmark engine, SQLite
    renderer/        # React UI: dashboard, runner, results, comparison
    preload/         # IPC bridge
  backend/           # Python FastAPI (alternative API for MCP/scripts)
  mcp-server/        # Standalone MCP server (FastMCP + 4 tools)
  frontend/          # Legacy web frontend (not used by Electron app)
```

## Compatible Endpoints

Any OpenAI-compatible API:
- [LM Studio](https://lmstudio.ai)
- [llama.cpp](https://github.com/ggml-org/llama.cpp) (llama-server)
- [Ollama](https://ollama.ai)
- [vLLM](https://vllm.ai)
- [LocalAI](https://localai.io)

## License

MIT
