"""pccontrol — Full Desktop Access via Pure PowerShell/Win32 APIs.

DANGER: This tool provides FULL control of the Windows desktop.
When armed, the agent can:
- Click anywhere on screen (single, double, right-click)
- Type into any application
- Send keypress commands (Enter, Tab, Escape, etc.)
- Launch any application
- List open windows

SECURITY: All actions are gated by an armed flag file at
mcp-server/config/pccontrol-armed.flag. Without this file, all actions
except help/status are blocked. Create the flag file to arm the tool.

No external dependencies — uses pure PowerShell with Win32 APIs.

IMPORTANT: For accurate click coordinates, set Windows display scaling to 100%.
At 125% or higher, click coordinates will be offset. Go to Windows Settings ->
Display -> Scale and layout -> Set to 100%.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import platform
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("litebench.pccontrol")

# ── Platform guard ────────────────────────────────────────────────────────────

if platform.system() == "Windows":
    PCCONTROL_ENABLED = True
else:
    PCCONTROL_ENABLED = False

# ── Paths ─────────────────────────────────────────────────────────────────────

def _get_mcp_server_root() -> Path:
    """Resolve mcp-server/ root from this file's location (tools/ subdir)."""
    return Path(__file__).resolve().parent.parent

_MCP_ROOT = _get_mcp_server_root()
ARMED_FLAG_PATH = _MCP_ROOT / "config" / "pccontrol-armed.flag"
AUDIT_LOG_PATH  = _MCP_ROOT / "logs" / "pccontrol-audit.log"

# ── Security gate ─────────────────────────────────────────────────────────────

def _is_armed() -> bool:
    """Return True if the armed flag file exists."""
    return ARMED_FLAG_PATH.exists()


def _require_armed() -> Optional[Dict[str, Any]]:
    """Return an error dict if not armed, None if armed."""
    if not _is_armed():
        return {
            "ok": False,
            "error": (
                "Full Desktop Access is not armed. "
                f"Create the flag file to enable: {ARMED_FLAG_PATH}"
            ),
            "error_code": "NOT_ARMED",
            "armed": False,
            "how_to_enable": [
                f"1. Create the file: {ARMED_FLAG_PATH}",
                "   (contents don't matter — its existence arms the tool)",
                "2. Restart or re-invoke pccontrol.",
                "3. Run pccontrol(action='status') to verify.",
            ],
        }
    return None

# ── Helpers ───────────────────────────────────────────────────────────────────

def _audit_log(action: str, args: Dict, result: str) -> None:
    """Append one line to the audit log."""
    try:
        AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        ts = datetime.datetime.now().isoformat()
        safe_args = dict(args)
        if "text" in safe_args and len(str(safe_args.get("text", ""))) > 50:
            safe_args["text"] = str(safe_args["text"])[:50] + "...[truncated]"
        with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] [{action}] {json.dumps(safe_args)} -> {result}\n")
    except Exception as exc:
        logger.warning("Failed to write audit log: %s", exc)


def _ok(data: Any = None, **kwargs) -> Dict[str, Any]:
    result: Dict[str, Any] = {"ok": True}
    if data is not None:
        result["data"] = data
    result.update(kwargs)
    return result


def _err(error: str, error_code: str = "ERROR", **kwargs) -> Dict[str, Any]:
    result: Dict[str, Any] = {"ok": False, "error": error, "error_code": error_code}
    result.update(kwargs)
    return result


def _run_powershell(script: str, timeout: int = 10) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["powershell", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
        timeout=timeout,
    )

# ── Action implementations ────────────────────────────────────────────────────

def _action_help(**kwargs) -> Dict[str, Any]:
    return _ok({
        "tool": "pccontrol",
        "description": "Full Desktop Access — control Windows PC via PowerShell/Win32 APIs",
        "armed_flag": str(ARMED_FLAG_PATH),
        "audit_log": str(AUDIT_LOG_PATH),
        "actions": {
            "help":        "List available actions and parameters",
            "status":      "Check armed state and PowerShell readiness",
            "click":       "Left-click at (x, y)",
            "doubleclick": "Double-click at (x, y)",
            "rightclick":  "Right-click at (x, y)",
            "type":        "Type text at current focus",
            "keypress":    "Send a special key (Enter, Tab, Escape, F1-F12, ctrl+c, etc.)",
            "launch_app":  "Launch an application by path or name",
            "get_windows": "Get list of open windows with titles",
        },
        "examples": {
            "click":       'pccontrol(action="click", x=500, y=300)',
            "doubleclick": 'pccontrol(action="doubleclick", x=500, y=300)',
            "rightclick":  'pccontrol(action="rightclick", x=500, y=300)',
            "type":        'pccontrol(action="type", text="Hello World")',
            "keypress":    'pccontrol(action="keypress", key="Enter")',
            "launch_app":  'pccontrol(action="launch_app", path="notepad.exe")',
        },
        "warning": "DANGER: This tool has FULL control of your PC when armed!",
        "dpi_note": (
            "For accurate click coordinates, set Windows display scaling to 100%. "
            "At 125%+ coordinates will be offset."
        ),
    })


def _action_status(**kwargs) -> Dict[str, Any]:
    armed = _is_armed()
    test_script = 'Add-Type -AssemblyName System.Windows.Forms; Write-Output "ready"'
    try:
        result = _run_powershell(test_script, timeout=5)
        powershell_ready = result.returncode == 0 and "ready" in result.stdout
        return _ok(
            armed=armed,
            powershell_ready=powershell_ready,
            armed_flag_path=str(ARMED_FLAG_PATH),
            status="ARMED — ready for desktop control" if armed else "DISARMED — create armed flag to enable",
        )
    except Exception as e:
        return _err(str(e), error_code="STATUS_FAILED", armed=armed, powershell_ready=False)


def _action_click(x: Optional[int] = None, y: Optional[int] = None, **kwargs) -> Dict[str, Any]:
    if err := _require_armed():
        return err
    if x is None or y is None:
        return _err("x and y coordinates are required", error_code="MISSING_PARAM")

    ps_script = f'''
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {{
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP   = 0x04;
}}
"@
[MouseOps]::SetCursorPos({x}, {y})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("click", {"x": x, "y": y}, f"error: {result.stderr}")
            return _err(f"Click failed: {result.stderr}", error_code="CLICK_FAILED")
        _audit_log("click", {"x": x, "y": y}, "success")
        return _ok(clicked="left", x=x, y=y)
    except Exception as e:
        _audit_log("click", {"x": x, "y": y}, f"error: {e}")
        return _err(str(e), error_code="CLICK_FAILED")


def _action_doubleclick(x: Optional[int] = None, y: Optional[int] = None, **kwargs) -> Dict[str, Any]:
    if err := _require_armed():
        return err
    if x is None or y is None:
        return _err("x and y coordinates are required", error_code="MISSING_PARAM")

    ps_script = f'''
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {{
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP   = 0x04;
}}
"@
[MouseOps]::SetCursorPos({x}, {y})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("doubleclick", {"x": x, "y": y}, f"error: {result.stderr}")
            return _err(f"Double-click failed: {result.stderr}", error_code="DOUBLECLICK_FAILED")
        _audit_log("doubleclick", {"x": x, "y": y}, "success")
        return _ok(clicked="double", x=x, y=y)
    except Exception as e:
        _audit_log("doubleclick", {"x": x, "y": y}, f"error: {e}")
        return _err(str(e), error_code="DOUBLECLICK_FAILED")


def _action_rightclick(x: Optional[int] = None, y: Optional[int] = None, **kwargs) -> Dict[str, Any]:
    if err := _require_armed():
        return err
    if x is None or y is None:
        return _err("x and y coordinates are required", error_code="MISSING_PARAM")

    ps_script = f'''
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {{
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_RIGHTDOWN = 0x08;
    public const int MOUSEEVENTF_RIGHTUP   = 0x10;
}}
"@
[MouseOps]::SetCursorPos({x}, {y})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("rightclick", {"x": x, "y": y}, f"error: {result.stderr}")
            return _err(f"Right-click failed: {result.stderr}", error_code="RIGHTCLICK_FAILED")
        _audit_log("rightclick", {"x": x, "y": y}, "success")
        return _ok(clicked="right", x=x, y=y)
    except Exception as e:
        _audit_log("rightclick", {"x": x, "y": y}, f"error: {e}")
        return _err(str(e), error_code="RIGHTCLICK_FAILED")


def _action_type(text: str = "", **kwargs) -> Dict[str, Any]:
    if err := _require_armed():
        return err
    if not text:
        return _err("text parameter is required", error_code="MISSING_PARAM")

    # Escape SendKeys special characters
    escaped = text
    for char in ["+", "^", "%", "~", "(", ")", "{", "}", "[", "]"]:
        escaped = escaped.replace(char, "{" + char + "}")
    escaped = escaped.replace('"', '`"')

    ps_script = f'''
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{escaped}")
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("type", {"length": len(text)}, f"error: {result.stderr}")
            return _err(f"Type failed: {result.stderr}", error_code="TYPE_FAILED")
        log_text = text[:50] + "..." if len(text) > 50 else text
        _audit_log("type", {"text": log_text, "length": len(text)}, "success")
        return _ok(typed=True, length=len(text))
    except Exception as e:
        _audit_log("type", {"length": len(text)}, f"error: {e}")
        return _err(str(e), error_code="TYPE_FAILED")


def _action_keypress(key: str = "", **kwargs) -> Dict[str, Any]:
    if err := _require_armed():
        return err
    if not key:
        return _err("key parameter is required", error_code="MISSING_PARAM")

    key_map = {
        "enter": "{ENTER}", "return": "{ENTER}",
        "tab": "{TAB}",
        "escape": "{ESC}", "esc": "{ESC}",
        "backspace": "{BACKSPACE}", "bs": "{BACKSPACE}",
        "delete": "{DELETE}", "del": "{DELETE}",
        "insert": "{INSERT}", "ins": "{INSERT}",
        "home": "{HOME}", "end": "{END}",
        "pageup": "{PGUP}", "pgup": "{PGUP}",
        "pagedown": "{PGDN}", "pgdn": "{PGDN}",
        "up": "{UP}", "down": "{DOWN}", "left": "{LEFT}", "right": "{RIGHT}",
        "space": " ",
        "f1": "{F1}", "f2": "{F2}", "f3": "{F3}", "f4": "{F4}",
        "f5": "{F5}", "f6": "{F6}", "f7": "{F7}", "f8": "{F8}",
        "f9": "{F9}", "f10": "{F10}", "f11": "{F11}", "f12": "{F12}",
        "ctrl+a": "^a", "ctrl+c": "^c", "ctrl+v": "^v", "ctrl+x": "^x",
        "ctrl+z": "^z", "ctrl+y": "^y", "ctrl+s": "^s",
        "alt+f4": "%{F4}", "alt+tab": "%{TAB}",
    }

    key_lower = key.lower().strip()
    sendkey = key_map.get(key_lower)

    if not sendkey:
        if len(key) == 1:
            sendkey = key
        else:
            return _err(
                f"Unknown key: {key}",
                error_code="UNKNOWN_KEY",
                available_keys=list(key_map.keys()),
            )

    ps_script = f'''
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{sendkey}")
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("keypress", {"key": key}, f"error: {result.stderr}")
            return _err(f"Keypress failed: {result.stderr}", error_code="KEYPRESS_FAILED")
        _audit_log("keypress", {"key": key}, "success")
        return _ok(pressed=key, sendkey=sendkey)
    except Exception as e:
        _audit_log("keypress", {"key": key}, f"error: {e}")
        return _err(str(e), error_code="KEYPRESS_FAILED")


def _action_launch_app(path: str = "", **kwargs) -> Dict[str, Any]:
    if err := _require_armed():
        return err
    if not path:
        return _err("path parameter is required", error_code="MISSING_PARAM")

    escaped_path = path.replace("'", "''")
    ps_script = f"Start-Process -FilePath '{escaped_path}'"

    try:
        result = _run_powershell(ps_script, timeout=30)
        if result.returncode != 0:
            _audit_log("launch_app", {"path": path}, f"error: {result.stderr}")
            return _err(f"Launch failed: {result.stderr}", error_code="LAUNCH_FAILED")
        _audit_log("launch_app", {"path": path}, "success")
        return _ok(launched=True, path=path)
    except Exception as e:
        _audit_log("launch_app", {"path": path}, f"error: {e}")
        return _err(str(e), error_code="LAUNCH_FAILED")


def _action_get_windows(**kwargs) -> Dict[str, Any]:
    if err := _require_armed():
        return err

    ps_script = '''
Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | ForEach-Object {
    [PSCustomObject]@{
        ProcessName = $_.ProcessName
        Title       = $_.MainWindowTitle
        Id          = $_.Id
    }
} | ConvertTo-Json -Compress
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            return _err(f"Get windows failed: {result.stderr}", error_code="GET_WINDOWS_FAILED")
        output = result.stdout.strip()
        if not output:
            return _ok(windows=[], count=0)
        windows = json.loads(output)
        if isinstance(windows, dict):
            windows = [windows]
        return _ok(windows=windows, count=len(windows))
    except json.JSONDecodeError as e:
        return _err(f"Failed to parse window list: {e}", error_code="PARSE_FAILED")
    except Exception as e:
        return _err(str(e), error_code="GET_WINDOWS_FAILED")


# ── Action router ─────────────────────────────────────────────────────────────

_ACTION_HANDLERS = {
    "help":        _action_help,
    "status":      _action_status,
    "click":       _action_click,
    "doubleclick": _action_doubleclick,
    "rightclick":  _action_rightclick,
    "type":        _action_type,
    "keypress":    _action_keypress,
    "launch_app":  _action_launch_app,
    "get_windows": _action_get_windows,
}


# ── Public entry point ────────────────────────────────────────────────────────

def handle_pccontrol(
    action: str,
    x: Optional[int] = None,
    y: Optional[int] = None,
    text: str = "",
    key: str = "",
    path: str = "",
    **kwargs: Any,
) -> str:
    """pccontrol — Full Desktop Access via Pure PowerShell/Win32 APIs.

    DANGER: Has FULL control of the Windows PC when the armed flag exists.

    Parameters
    ----------
    action : str
        One of: help, status, click, doubleclick, rightclick, type,
        keypress, launch_app, get_windows.
    x, y : int | None
        Coordinates for click actions.
    text : str
        Text to type (for type action).
    key : str
        Key name to press (for keypress action).
    path : str
        Application path or name (for launch_app action).
    """
    if not PCCONTROL_ENABLED:
        return json.dumps(_err(
            "pccontrol requires Windows (PowerShell + Win32 APIs). "
            "This tool is not supported on the current platform.",
            error_code="PLATFORM_UNSUPPORTED",
            platform=platform.system(),
        ), indent=2)

    act = (action or "").strip().lower()

    if not act:
        return json.dumps(_err(
            "action is required",
            error_code="MISSING_PARAM",
            available_actions=list(_ACTION_HANDLERS.keys()),
        ), indent=2)

    handler = _ACTION_HANDLERS.get(act)
    if not handler:
        return json.dumps(_err(
            f"Unknown action: {act}",
            error_code="UNKNOWN_ACTION",
            available_actions=list(_ACTION_HANDLERS.keys()),
        ), indent=2)

    result = handler(x=x, y=y, text=text, key=key, path=path, **kwargs)
    return json.dumps(result, indent=2, ensure_ascii=False)
