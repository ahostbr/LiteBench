from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


# ── Endpoints ──────────────────────────────────────────────────────────────

class EndpointCreate(BaseModel):
    name: str
    base_url: str
    api_key: str = "lm-studio"

class EndpointUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    is_active: Optional[bool] = None

class EndpointOut(BaseModel):
    id: int
    name: str
    base_url: str
    api_key: str
    is_active: bool
    created_at: str


# ── Test Suites / Cases ───────────────────────────────────────────────────

class TestSuiteCreate(BaseModel):
    name: str
    description: str = ""

class TestSuiteOut(BaseModel):
    id: int
    name: str
    description: str
    is_default: bool
    created_at: str
    cases: list[TestCaseOut] = []

class TestCaseCreate(BaseModel):
    test_id: str
    category: str
    name: str
    system_prompt: str
    user_prompt: str
    eval_keywords: list[str] = []
    eval_anti: list[str] = []
    eval_json: bool = False
    eval_sentence_count: Optional[int] = None
    max_tokens: int = 600
    sort_order: int = 0

class TestCaseUpdate(BaseModel):
    test_id: Optional[str] = None
    category: Optional[str] = None
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    user_prompt: Optional[str] = None
    eval_keywords: Optional[list[str]] = None
    eval_anti: Optional[list[str]] = None
    eval_json: Optional[bool] = None
    eval_sentence_count: Optional[int] = None
    max_tokens: Optional[int] = None
    sort_order: Optional[int] = None

class TestCaseOut(BaseModel):
    id: int
    suite_id: int
    test_id: str
    category: str
    name: str
    system_prompt: str
    user_prompt: str
    eval_keywords: list[str]
    eval_anti: list[str]
    eval_json: bool
    eval_sentence_count: Optional[int]
    max_tokens: int
    sort_order: int


# ── Benchmark Runs / Results ──────────────────────────────────────────────

class BenchmarkRunRequest(BaseModel):
    endpoint_id: int
    suite_id: int
    model_id: str
    model_name: str
    is_thinking: bool = False

class BenchmarkRunOut(BaseModel):
    id: int
    endpoint_id: int
    suite_id: int
    model_id: str
    model_name: str
    is_thinking: bool
    status: str
    avg_score: Optional[float]
    avg_tps: Optional[float]
    total_time_s: Optional[float]
    started_at: Optional[str]
    completed_at: Optional[str]
    results: list[TestResultOut] = []

class TestResultOut(BaseModel):
    id: int
    run_id: int
    test_case_id: int
    test_id: str
    category: str
    name: str
    content: str
    elapsed_s: float
    prompt_tokens: int
    completion_tokens: int
    tokens_per_sec: float
    finish_reason: Optional[str]
    final_score: float
    keyword_score: float
    keyword_hits: list[str]
    keyword_misses: list[str]
    violations: list[str]
    had_thinking: bool
    thinking_tokens_approx: int
    answer_length: int


# ── Compare / Import ──────────────────────────────────────────────────────

class CompareOut(BaseModel):
    runs: list[BenchmarkRunOut]

class ImportRequest(BaseModel):
    file_path: str
