# api/process.py
# Exports FastAPI app from api.index so both /api/process and /api/index entrypoints work seamlessly on Vercel
from api.index import app
