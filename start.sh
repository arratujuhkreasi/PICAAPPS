#!/usr/bin/env bash
set -euo pipefail

echo "Starting Reclipa..."
npm install
npm run db:push
npm run dev
