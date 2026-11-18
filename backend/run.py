"""Start the InferSmart control centre. Used by scripts/start.bat and the start-up shortcut."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    import uvicorn
    from app.config import APP_HOST, APP_PORT
    uvicorn.run("app.main:app", host=APP_HOST, port=APP_PORT, log_level="warning", access_log=False)
