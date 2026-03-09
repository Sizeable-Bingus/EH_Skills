"""CLI entrypoint for running the dashboard locally."""

import uvicorn

try:
    from .app import app
except ImportError:
    from app import app


def main() -> None:
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
