#!/bin/bash

# Simple script to start the console frontend without package checking
# Supports connecting to local or remote backend via environment variable
# Usage:
#   ./start-dev-console-only.sh                    # Connect to localhost:8085
#   BACKEND_URL=http://remote-host:8085 ./start-dev-console-only.sh  # Connect to remote backend

set -e

echo "🎨 Starting Frontend Console in Development Mode"
echo "================================================"

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CONSOLE_DIR="/home/vabar/Projects/skupper-X/components/console"

# Default backend URL
DEFAULT_BACKEND_URL="http://localhost:8085"
BACKEND_URL="${BACKEND_URL:-$DEFAULT_BACKEND_URL}"

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Display backend configuration
if [ "$BACKEND_URL" = "$DEFAULT_BACKEND_URL" ]; then
    log_info "Using default backend: $BACKEND_URL"
else
    log_warning "Using remote backend: $BACKEND_URL"
    log_info "To use local backend, run without BACKEND_URL environment variable"
fi

# Verifica che il backend sia in esecuzione
log_info "Checking if backend is responding at $BACKEND_URL..."
if ! curl -s "$BACKEND_URL/healthz" >/dev/null 2>&1; then
    echo "❌ Backend is not responding at $BACKEND_URL"
    if [ "$BACKEND_URL" = "$DEFAULT_BACKEND_URL" ]; then
        echo "ℹ️  Start the local backend first with:"
        echo "   cd /home/vabar/Projects/skupper-X/components/management-controller"
        echo "   npm run dev"
    else
        echo "ℹ️  Make sure the remote backend is running and accessible"
        echo "ℹ️  Check firewall and network connectivity to: $BACKEND_URL"
    fi
    exit 1
fi

log_success "Backend is responding"

cd "$CONSOLE_DIR"

# Verifica dipendenze
if [ ! -d "node_modules" ]; then
    log_info "Installing dependencies..."
    yarn install
fi

log_info "Starting development server..."
log_success "🎯 Console will be available at: http://localhost:3000"
log_info "API calls will be proxied to backend at: $BACKEND_URL"
echo ""

# Export the backend URL for webpack to use
export BACKEND_URL="$BACKEND_URL"

yarn start
