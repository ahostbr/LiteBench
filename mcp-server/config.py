import os

BENCH_API_URL = os.environ.get("LITEBENCH_API_URL", "http://127.0.0.1:8001")
SERVER_TRANSPORT = os.environ.get("LITEBENCH_MCP_TRANSPORT", "stdio")
SERVER_PORT = int(os.environ.get("LITEBENCH_MCP_PORT", "8901"))
