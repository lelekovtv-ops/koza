#!/bin/bash
# PIECE dev server — clean start, no Turbopack cache bugs
echo "🧹 Killing old server..."
lsof -ti :3001 | xargs kill -9 2>/dev/null
sleep 1

echo "🗑  Cleaning .next cache..."
rm -rf .next

echo "🚀 Starting Next.js dev server on :3001..."
npx next dev -p 3001
