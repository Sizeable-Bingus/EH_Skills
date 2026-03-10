"""Subprocess manager for the pentest pipeline (one-at-a-time)."""

import asyncio
import os
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

PHASE_RE = re.compile(r"PHASE:\s*(.+)")


class PipelineStatus(str, Enum):
    idle = "idle"
    running = "running"
    complete = "complete"
    error = "error"


@dataclass
class PipelineState:
    status: PipelineStatus = PipelineStatus.idle
    target: str = ""
    current_phase: str = ""
    log_lines: list[str] = field(default_factory=list)
    subscribers: list[asyncio.Queue[str | None]] = field(default_factory=list)
    process: asyncio.subprocess.Process | None = field(default=None, repr=False)
    _task: asyncio.Task | None = field(default=None, repr=False)


_state = PipelineState()


def get_state() -> PipelineState:
    return _state


async def start_pipeline(
    target: str,
    username: str | None = None,
    password: str | None = None,
) -> PipelineState:
    if _state.status == PipelineStatus.running:
        raise RuntimeError("Pipeline already running")

    # Terminate any stale subscribers from a previous run
    for q in list(_state.subscribers):
        q.put_nowait(None)
    _state.subscribers.clear()

    _state.status = PipelineStatus.running
    _state.target = target
    _state.current_phase = "Starting"
    _state.log_lines.clear()

    env = os.environ.copy()
    if username:
        env["PENTEST_CRED_USERNAME"] = username
    if password:
        env["PENTEST_CRED_PASSWORD"] = password

    proc = await asyncio.create_subprocess_exec(
        #"uv", "run", "python3", "pentest_pipeline_test.py", target,
        "uv", "run", "python3", "pentest_pipeline.py", target,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(PROJECT_ROOT),
        env=env,
    )
    _state.process = proc
    _state._task = asyncio.create_task(_read_output(proc))
    return _state


async def _read_output(proc: asyncio.subprocess.Process) -> None:
    assert proc.stdout is not None
    try:
        async for raw in proc.stdout:
            line = raw.decode(errors="replace").rstrip("\n")
            _state.log_lines.append(line)

            m = PHASE_RE.search(line)
            if m:
                _state.current_phase = m.group(1).strip()

            for q in list(_state.subscribers):
                q.put_nowait(line)

        await proc.wait()
        _state.status = (
            PipelineStatus.complete if proc.returncode == 0 else PipelineStatus.error
        )
        _state.current_phase = (
            "Complete" if proc.returncode == 0 else f"Exited ({proc.returncode})"
        )
    except Exception as exc:
        _state.status = PipelineStatus.error
        _state.current_phase = f"Error: {exc}"

    # Send sentinel to all subscribers
    for q in list(_state.subscribers):
        q.put_nowait(None)


def subscribe() -> asyncio.Queue[str | None]:
    q: asyncio.Queue[str | None] = asyncio.Queue()
    # Backfill existing lines
    for line in _state.log_lines:
        q.put_nowait(line)
    # If pipeline already finished, send sentinel immediately
    if _state.status in (PipelineStatus.complete, PipelineStatus.error):
        q.put_nowait(None)
    else:
        _state.subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue[str | None]) -> None:
    try:
        _state.subscribers.remove(q)
    except ValueError:
        pass
