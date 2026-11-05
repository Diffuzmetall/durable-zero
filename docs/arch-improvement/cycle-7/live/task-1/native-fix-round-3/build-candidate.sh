#!/usr/bin/env bash
set -euo pipefail

# Reproducible Native Candidate Build Script for Milestone 7e12fa592a7de537ade6424f1b1a8a9aa4e6b648
TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TARGET_DIR/../../../../../.." && pwd)"
COMMIT_HASH="7e12fa592a7de537ade6424f1b1a8a9aa4e6b648"

echo "=== Native Fix-Round-3 Build: $COMMIT_HASH ==="
echo "Repo root: $REPO_ROOT"
echo "Target dir: $TARGET_DIR"

TEMP_BUILD_DIR="$(mktemp -d -t dz-frozen-fix3-XXXXXX)"
echo "Created isolated build workspace: $TEMP_BUILD_DIR"

cleanup() {
	echo "Cleaning up temp build workspace: $TEMP_BUILD_DIR"
	rm -rf "$TEMP_BUILD_DIR"
}
trap cleanup EXIT

echo "Extracting clean git archive for commit $COMMIT_HASH..."
(cd "$REPO_ROOT" && git archive "$COMMIT_HASH" | tar -x -C "$TEMP_BUILD_DIR")

echo "Running offline frozen-lockfile pnpm install..."
(cd "$TEMP_BUILD_DIR" && pnpm install --frozen-lockfile --offline --ignore-scripts)

echo "Cleaning stale package dist directories..."
rm -rf "$TEMP_BUILD_DIR"/packages/*/dist

echo "Building fresh packages with existing build pipeline..."
(cd "$TEMP_BUILD_DIR" && node scripts/build.mjs)

echo "Running official typecheck..."
(cd "$TEMP_BUILD_DIR" && pnpm run typecheck)

echo "Packaging frozen CLI and Runner into candidate directory..."
mkdir -p "$TARGET_DIR/packages/cli/bin"
mkdir -p "$TARGET_DIR/packages/runner/dist"
mkdir -p "$TARGET_DIR/packages/core/dist"
mkdir -p "$TARGET_DIR/fixtures"

# 1. Preserve CLI bytes exactly as committed
cp "$TEMP_BUILD_DIR/packages/cli/bin/durable-zero.js" "$TARGET_DIR/packages/cli/bin/durable-zero.js"
chmod +x "$TARGET_DIR/packages/cli/bin/durable-zero.js"

# 2. Fresh built runner dist
cp "$TEMP_BUILD_DIR/packages/runner/dist/main.js" "$TARGET_DIR/packages/runner/dist/main.js"
cp "$TEMP_BUILD_DIR/packages/runner/dist/main.js.map" "$TARGET_DIR/packages/runner/dist/main.js.map"
chmod +x "$TARGET_DIR/packages/runner/dist/main.js"

# 3. QuickJS WASM assets
cp "$TEMP_BUILD_DIR/packages/runner/dist/quickjs.wasm" "$TARGET_DIR/packages/runner/dist/quickjs.wasm"
cp "$TEMP_BUILD_DIR/packages/core/dist/quickjs.wasm" "$TARGET_DIR/packages/core/dist/quickjs.wasm"

# 4. Public Extension Fixture
cp "$TEMP_BUILD_DIR/packages/runner/test/fixtures/scripted-provider-extension.ts" "$TARGET_DIR/fixtures/scripted-provider-extension.ts"

echo "Build, typecheck, and packaging completed successfully."
