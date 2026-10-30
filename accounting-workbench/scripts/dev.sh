#!/usr/bin/env bash
set -e

# 启动后端
cd backend
python -m uvicorn accounting_backend.main:app --reload --port 0 &
BACKEND_PID=$!

# 启动前端
cd ../src
npm run dev &
FRONTEND_PID=$!

# 等待退出
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait