#!/usr/bin/env bash
set -e

# 清理
rm -rf dist/

# 打包后端
cd backend
python build.py --release

# 打包 Tauri
cd ..
npm run tauri build -- --release

echo "发布包已生成到 src-tauri/target/release/bundle/"