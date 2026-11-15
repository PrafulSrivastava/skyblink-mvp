"""Serve api/live.py locally (next dev does not run Vercel Python functions).

    python scripts/live_dev_server.py [--port 8787]

Binds 127.0.0.1 only. CORS is enabled so the Next dev page on another port can call it.
"""
import argparse
import importlib.util
import os
from http.server import ThreadingHTTPServer
from pathlib import Path

os.environ["LIVE_DEV_CORS"] = "1"  # must be set before the handler serves anything

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("live", ROOT / "api" / "live.py")
live = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(live)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    port = ap.parse_args().port
    server = ThreadingHTTPServer(("127.0.0.1", port), live.handler)
    print(f"live backend on http://127.0.0.1:{port}/api/live/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
