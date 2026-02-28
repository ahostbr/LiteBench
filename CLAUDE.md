## LiteBench — LLM Benchmark Studio

- **Backend:** Python FastAPI at `backend/`, runs on port 8001
- **Frontend:** React + Vite + TypeScript at `frontend/`, runs on port 5174
- **Database:** SQLite at `backend/litebench.db`
- **Charts:** ECharts 6 via echarts-for-react (modular imports)
- **Styling:** Tailwind CSS v4, dark zinc theme
- **State:** Zustand 5 stores
- **Streaming:** SSE for live benchmark progress

### Commands
- Backend: `cd backend && uvicorn main:app --reload --port 8001`
- Frontend: `cd frontend && pnpm dev`
- Install backend: `cd backend && pip install -r requirements.txt`
- Install frontend: `cd frontend && pnpm install`
