#!/bin/bash

# Script per avviare solo il frontend console in modalità sviluppo
# Assume che il backend sia già in esecuzione su porta 8085

set -e

echo "🎨 Starting Frontend Console in Development Mode"
echo "================================================"

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

CONSOLE_DIR="/home/vabar/Projects/skupper-X/components/console"

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Verifica che il backend sia in esecuzione
log_info "Checking if backend is running on port 8085..."
if ! curl -s http://localhost:8085/healthz >/dev/null 2>&1; then
    echo "❌ Backend is not responding on port 8085"
    echo "ℹ️  Start the backend first with:"
    echo "   cd /home/vabar/Projects/skupper-X"
    echo "   ./start-skupper-standalone.sh"
    echo ""
    echo "Or use the full development script:"
    echo "   ./start-dev-mode.sh"
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
log_info "API calls will be proxied to backend at: http://localhost:8085"
echo ""

yarn start
