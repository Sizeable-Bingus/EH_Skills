"""CLI entrypoint for running the dashboard locally."""

import uvicorn

try:
    from .app import app as app  # noqa: F401 — re-export for uvicorn string ref
except ImportError:
    from app import app as app  # noqa: F401


def main() -> None:
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
