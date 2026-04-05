"""YouTube tool — fetch transcripts and video info via yt-dlp.

Actions: transcript, info, help
"""

from __future__ import annotations
import json
import os
import re
import subprocess
import tempfile
from typing import Any


def _extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'[?&]v=([A-Za-z0-9_-]{11})',
        r'youtu\.be/([A-Za-z0-9_-]{11})',
        r'shorts/([A-Za-z0-9_-]{11})',
        r'embed/([A-Za-z0-9_-]{11})',
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def _parse_json3_subs(path: str) -> list[dict]:
    """Parse yt-dlp JSON3 subtitle format into timestamped segments."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    segments = []
    for event in data.get("events", []):
        start_ms = event.get("tStartMs", 0)
        dur_ms = event.get("dDurationMs", 0)
        segs = event.get("segs", [])
        text = "".join(s.get("utf8", "") for s in segs).strip()
        if text and text != "\n":
            segments.append({
                "start": start_ms / 1000.0,
                "end": (start_ms + dur_ms) / 1000.0,
                "text": text,
            })
    return segments


def _format_timestamp(seconds: float) -> str:
    """Format seconds as MM:SS."""
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def handle_youtube(
    action: str,
    url: str | None = None,
) -> str:
    action = action.strip().lower()

    if action == "help":
        return """YouTube — fetch transcripts and video info via yt-dlp.

Actions:
  transcript — Fetch and format the transcript. params: url
  info       — Get video metadata (title, channel, duration). params: url
  help       — Show this help.

Requires: yt-dlp (pip install yt-dlp)"""

    if not url:
        return "Error: 'url' is required."

    video_id = _extract_video_id(url)
    if not video_id:
        return f"Error: Could not extract video ID from: {url}"

    canonical = f"https://www.youtube.com/watch?v={video_id}"

    if action == "info":
        try:
            result = subprocess.run(
                ["yt-dlp", "--dump-json", "--skip-download", canonical],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                return f"yt-dlp error: {result.stderr.strip()}"
            meta = json.loads(result.stdout)
            duration = meta.get("duration", 0)
            m, s = divmod(int(duration), 60)
            h, m = divmod(m, 60)
            dur_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
            return (
                f"**{meta.get('title', 'Unknown')}**\n"
                f"Channel: {meta.get('channel', 'Unknown')}\n"
                f"Duration: {dur_str}\n"
                f"Views: {meta.get('view_count', 'N/A'):,}\n"
                f"Upload: {meta.get('upload_date', 'N/A')}\n"
                f"URL: {canonical}"
            )
        except subprocess.TimeoutExpired:
            return "Error: yt-dlp timed out."
        except FileNotFoundError:
            return "Error: yt-dlp not found. Install with: pip install yt-dlp"
        except Exception as e:
            return f"Error: {e}"

    if action == "transcript":
        tmp_dir = tempfile.mkdtemp(prefix="litebench-yt-")
        sub_base = os.path.join(tmp_dir, f"subs-{video_id}")

        try:
            # Try manual subs first, fall back to auto
            result = subprocess.run(
                [
                    "yt-dlp",
                    "--write-sub", "--write-auto-sub",
                    "--sub-lang", "en",
                    "--sub-format", "json3",
                    "--skip-download",
                    "--no-warnings",
                    "-o", sub_base,
                    canonical,
                ],
                capture_output=True, text=True, timeout=60,
            )

            # Find the subtitle file
            sub_file = None
            for ext in [".en.json3", ".en-orig.json3"]:
                candidate = sub_base + ext
                if os.path.exists(candidate):
                    sub_file = candidate
                    break

            if not sub_file:
                # Check if any json3 file was created
                for f in os.listdir(tmp_dir):
                    if f.endswith(".json3"):
                        sub_file = os.path.join(tmp_dir, f)
                        break

            if not sub_file:
                return (
                    f"No English subtitles found for {canonical}\n"
                    f"yt-dlp output: {result.stderr.strip()}"
                )

            # Get video title
            title_result = subprocess.run(
                ["yt-dlp", "--print", "%(title)s", "--print", "%(channel)s", "--skip-download", canonical],
                capture_output=True, text=True, timeout=15,
            )
            lines = title_result.stdout.strip().split("\n")
            title = lines[0] if lines else "Unknown"
            channel = lines[1] if len(lines) > 1 else "Unknown"

            # Parse and format transcript
            segments = _parse_json3_subs(sub_file)
            if not segments:
                return "Subtitles file was empty."

            output_lines = [
                f"# {title}",
                f"**Channel:** {channel}",
                f"**URL:** {canonical}",
                "",
                "---",
                "",
            ]
            for seg in segments:
                ts = _format_timestamp(seg["start"])
                output_lines.append(f"**{ts}** {seg['text']}")

            return "\n".join(output_lines)

        except subprocess.TimeoutExpired:
            return "Error: yt-dlp timed out."
        except FileNotFoundError:
            return "Error: yt-dlp not found. Install with: pip install yt-dlp"
        except Exception as e:
            return f"Error: {e}"
        finally:
            # Cleanup temp files
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)

    return f"Unknown action '{action}'. Use action='help' for options."
