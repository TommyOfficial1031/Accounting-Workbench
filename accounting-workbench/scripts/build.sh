#!/usr/bin/env bash
set -e

# 打包后端
cd backend
python build.py

# 打包前端与 Tauri
cd ..
npm run tauri build