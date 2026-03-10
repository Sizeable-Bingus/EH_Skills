"""CLI entrypoint for running the dashboard locally."""

import uvicorn

try:
    from .app import app as app  # noqa: F401 — re-export for uvicorn string ref
    APP_IMPORT = "dashboard.app:app"
except ImportError:
    from app import app as app  # noqa: F401
    APP_IMPORT = "app:app"


def main() -> None:
    uvicorn.run(APP_IMPORT, host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
