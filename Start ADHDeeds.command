#!/bin/bash
cd "$(dirname "$0")"
npm run build
npx vite preview --host 127.0.0.1 --port 4180
