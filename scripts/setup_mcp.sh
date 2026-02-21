#!/bin/bash

# ==========================================
# Fast-Lint-MCP: Agent Auto-Setup Script
# ==========================================

set -e

# 1. Check prerequisites
if ! command -v jq &> /dev/null; then
    echo "❌ Error: 'jq' is not installed."
    echo "Please install jq: brew install jq"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Error: 'node' is not installed."
    exit 1
fi

# 2. Get absolute paths
ROOT_DIR=$(pwd)
SERVER_PATH="$ROOT_DIR/dist/index.js"
NODE_PATH=$(which node)

if [ ! -f "$SERVER_PATH" ]; then
    echo "⚠️  Warning: Server build not found at $SERVER_PATH"
    echo "Running build..."
    npm install && npm run build
fi

# 3. Target Configuration File (Claude Desktop on macOS)
CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
CONFIG_DIR=$(dirname "$CLAUDE_CONFIG")

if [ ! -d "$CONFIG_DIR" ]; then
    echo "📁 Creating config directory: $CONFIG_DIR"
    mkdir -p "$CONFIG_DIR"
fi

if [ ! -f "$CLAUDE_CONFIG" ]; then
    echo "📄 Creating new config file..."
    echo '{ "mcpServers": {} }' > "$CLAUDE_CONFIG"
fi

# 4. Update Configuration using jq
echo "🔧 Configuring Claude Desktop..."

tmp=$(mktemp)
jq --arg name "fast-lint" 
   --arg cmd "$NODE_PATH" 
   --arg path "$SERVER_PATH" 
   '.mcpServers[$name] = { command: $cmd, args: [$path] }' 
   "$CLAUDE_CONFIG" > "$tmp" && mv "$tmp" "$CLAUDE_CONFIG"

echo "✅ Successfully added 'fast-lint' to Claude Desktop configuration!"
echo "   Path: $CLAUDE_CONFIG"
echo ""
echo "Please restart Claude Desktop to apply changes."
