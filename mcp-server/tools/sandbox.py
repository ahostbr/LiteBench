"""Sandbox tool — Isolated code execution.

Runs code in a subprocess and returns only stdout/stderr, keeping raw source
and intermediate data out of the calling agent's context window.

Actions: execute, execute_file, help
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path


# ── Language config ──────────────────────────────────────────────────────────

_LANGUAGES = {
    "python": {"cmd": ["python", "-u"], "ext": ".py"},
    "py":     {"cmd": ["python", "-u"], "ext": ".py"},
    "javascript": {"cmd": ["node"], "ext": ".js"},
    "js":         {"cmd": ["node"], "ext": ".js"},
    "typescript": {"cmd": ["npx", "tsx"], "ext": ".ts"},
    "ts":         {"cmd": ["npx", "tsx"], "ext": ".ts"},
    "bash": {"cmd": ["bash"], "ext": ".sh"},
    "sh":   {"cmd": ["bash"], "ext": ".sh"},
    "powershell": {"cmd": ["pwsh", "-NoProfile", "-File"], "ext": ".ps1"},
    "ps1":        {"cmd": ["pwsh", "-NoProfile", "-File"], "ext": ".ps1"},
    "ruby": {"cmd": ["ruby"], "ext": ".rb"},
    "rb":   {"cmd": ["ruby"], "ext": ".rb"},
    "go":   {"cmd": ["go", "run"], "ext": ".go"},
    "rust": {"cmd": ["rustc", "-o"], "ext": ".rs"},  # special handling
    "java": {"cmd": ["java"], "ext": ".java"},
    "c":    {"cmd": ["gcc", "-o"], "ext": ".c"},    # special handling
    "cpp":  {"cmd": ["g++", "-o"], "ext": ".cpp"},  # special handling
    "php":  {"cmd": ["php"], "ext": ".php"},
}

_DEFAULT_TIMEOUT = 30
_MAX_OUTPUT = 50_000  # chars


# ── Helpers ──────────────────────────────────────────────────────────────────

def _detect_language(source_path: str) -> str | None:
    """Guess language from file extension."""
    ext = Path(source_path).suffix.lower()
    ext_map = {v["ext"]: k for k, v in _LANGUAGES.items()}
    return ext_map.get(ext)


def _run_interpreted(cmd: list[str], code_path: str, timeout: int, cwd: str | None) -> dict:
    """Run an interpreted language (python, node, bash, etc.)."""
    result = subprocess.run(
        cmd + [code_path],
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=cwd,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.returncode,
    }


def _run_compiled(language: str, code_path: str, timeout: int, cwd: str | None) -> dict:
    """Compile and run C/C++/Rust."""
    tmp_exe = code_path + ".exe" if os.name == "nt" else code_path + ".out"

    if language in ("c", "cpp"):
        compiler = "gcc" if language == "c" else "g++"
        compile_cmd = [compiler, code_path, "-o", tmp_exe]
    elif language == "rust":
        compile_cmd = ["rustc", code_path, "-o", tmp_exe]
    else:
        return {"stdout": "", "stderr": f"Unsupported compiled language: {language}", "exit_code": 1}

    comp = subprocess.run(compile_cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
    if comp.returncode != 0:
        return {"stdout": "", "stderr": f"Compilation failed:\n{comp.stderr}", "exit_code": comp.returncode}

    try:
        result = subprocess.run(
            [tmp_exe], capture_output=True, text=True, timeout=timeout, cwd=cwd,
        )
        return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.returncode}
    finally:
        try:
            os.unlink(tmp_exe)
        except OSError:
            pass


# ── Execute action ───────────────────────────────────────────────────────────

def _execute(
    code: str,
    language: str,
    timeout: int = _DEFAULT_TIMEOUT,
    cwd: str | None = None,
) -> str:
    lang_key = language.strip().lower()
    if lang_key not in _LANGUAGES:
        return json.dumps({
            "error": f"Unsupported language '{language}'",
            "supported": sorted({k for k in _LANGUAGES if not k[-1].isdigit()}),
        }, indent=2)

    lang_cfg = _LANGUAGES[lang_key]
    code_bytes = len(code.encode("utf-8"))

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=lang_cfg["ext"], delete=False, encoding="utf-8",
    ) as f:
        f.write(code)
        code_path = f.name

    try:
        if lang_key in ("c", "cpp", "rust"):
            result = _run_compiled(lang_key, code_path, timeout, cwd)
        else:
            result = _run_interpreted(lang_cfg["cmd"], code_path, timeout, cwd)
    except subprocess.TimeoutExpired:
        return json.dumps({
            "error": f"Execution timed out after {timeout}s",
            "language": language,
            "code_bytes": code_bytes,
        }, indent=2)
    except FileNotFoundError as e:
        return json.dumps({
            "error": f"Runtime not found: {e}",
            "language": language,
            "hint": f"Is '{lang_cfg['cmd'][0]}' installed and on PATH?",
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e), "language": language}, indent=2)
    finally:
        try:
            os.unlink(code_path)
        except OSError:
            pass

    stdout = result["stdout"]
    stderr = result["stderr"]
    if len(stdout) > _MAX_OUTPUT:
        stdout = stdout[:_MAX_OUTPUT] + f"\n... (truncated from {len(result['stdout'])} chars)"
    if len(stderr) > _MAX_OUTPUT:
        stderr = stderr[:_MAX_OUTPUT] + f"\n... (truncated from {len(result['stderr'])} chars)"

    output_bytes = len(stdout.encode("utf-8")) + len(stderr.encode("utf-8"))

    return json.dumps({
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": result["exit_code"],
        "language": language,
        "code_bytes": code_bytes,
        "output_bytes": output_bytes,
        "savings_pct": round((1 - output_bytes / max(code_bytes, 1)) * 100, 1) if code_bytes > output_bytes else 0,
    }, indent=2, ensure_ascii=False)


# ── Execute file action ──────────────────────────────────────────────────────

def _execute_file(
    file_path: str,
    language: str | None = None,
    timeout: int = _DEFAULT_TIMEOUT,
    cwd: str | None = None,
) -> str:
    path = Path(file_path)
    if not path.exists():
        return json.dumps({"error": f"File not found: {file_path}"}, indent=2)

    lang = language or _detect_language(file_path)
    if not lang:
        return json.dumps({
            "error": f"Cannot detect language for '{path.suffix}'",
            "hint": "Pass language= explicitly",
        }, indent=2)

    lang_key = lang.strip().lower()
    if lang_key not in _LANGUAGES:
        return json.dumps({"error": f"Unsupported language '{lang}'"}, indent=2)

    code_bytes = path.stat().st_size
    lang_cfg = _LANGUAGES[lang_key]

    try:
        if lang_key in ("c", "cpp", "rust"):
            result = _run_compiled(lang_key, str(path), timeout, cwd)
        else:
            result = _run_interpreted(lang_cfg["cmd"], str(path), timeout, cwd)
    except subprocess.TimeoutExpired:
        return json.dumps({
            "error": f"Execution timed out after {timeout}s",
            "file": file_path,
            "language": lang,
        }, indent=2)
    except FileNotFoundError as e:
        return json.dumps({
            "error": f"Runtime not found: {e}",
            "language": lang,
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, indent=2)

    stdout = result["stdout"]
    stderr = result["stderr"]
    if len(stdout) > _MAX_OUTPUT:
        stdout = stdout[:_MAX_OUTPUT] + "\n... (truncated)"
    if len(stderr) > _MAX_OUTPUT:
        stderr = stderr[:_MAX_OUTPUT] + "\n... (truncated)"

    output_bytes = len(stdout.encode("utf-8")) + len(stderr.encode("utf-8"))

    return json.dumps({
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": result["exit_code"],
        "file": file_path,
        "language": lang,
        "code_bytes": code_bytes,
        "output_bytes": output_bytes,
        "savings_pct": round((1 - output_bytes / max(code_bytes, 1)) * 100, 1) if code_bytes > output_bytes else 0,
    }, indent=2, ensure_ascii=False)


# ── Main dispatch ────────────────────────────────────────────────────────────

def handle_sandbox(
    action: str,
    code: str | None = None,
    language: str | None = None,
    file_path: str | None = None,
    timeout: int = _DEFAULT_TIMEOUT,
    cwd: str | None = None,
) -> str:
    """Sandbox tool — isolated code execution.

    Parameters
    ----------
    action : str
        One of: execute, execute_file, help.
    code : str | None
        Source code to run (required for execute).
    language : str | None
        Language name (required for execute, auto-detected for execute_file).
    file_path : str | None
        Path to file to execute (required for execute_file).
    timeout : int
        Max execution time in seconds (default 30).
    cwd : str | None
        Working directory for execution.
    """
    action = action.strip().lower()

    if action == "help":
        return """Sandbox — Isolated Code Execution

Runs code in a subprocess, returns ONLY stdout/stderr. Keeps raw source
code and intermediate data out of the context window.

ACTIONS:
  execute      — Run inline code. params: code, language, [timeout], [cwd]
  execute_file — Run a file. params: file_path, [language], [timeout], [cwd]
  help         — Show this help.

SUPPORTED LANGUAGES:
  python/py, javascript/js, typescript/ts, bash/sh, powershell/ps1,
  ruby/rb, go, rust, java, c, cpp, php

CONTEXT SAVINGS:
  A 500-line Python script might produce 10 lines of output.
  code_bytes: 15000 -> output_bytes: 200 -> 98.7% savings

SAFETY:
  - Code runs in a subprocess with timeout (default 30s)
  - Output truncated at 50K chars
  - Temp files cleaned up after execution
  - No network sandboxing (code can access network/filesystem)

EXAMPLE:
  sandbox(action="execute", code="print(2+2)", language="python")
  -> {"stdout": "4\\n", "exit_code": 0, "savings_pct": 85.7}"""

    try:
        if action == "execute":
            if not code:
                return "Error: 'code' is required for execute."
            if not language:
                return "Error: 'language' is required for execute."
            return _execute(code, language, timeout, cwd)

        if action == "execute_file":
            if not file_path:
                return "Error: 'file_path' is required for execute_file."
            return _execute_file(file_path, language, timeout, cwd)

    except Exception as e:
        return f"Error: {e}"

    return f"Unknown action '{action}'. Valid: execute, execute_file, help"
