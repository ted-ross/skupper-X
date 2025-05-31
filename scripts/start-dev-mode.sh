#!/bin/bash

# Script completo per modalità sviluppo: avvia backend e frontend insieme
# Backend in background, frontend in foreground con hot reload

set -e

echo "🔧 Starting Skupper-X in Development Mode"
echo "========================================="

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directory di progetto
PROJECT_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
SCRIPTS_DIR="$PROJECT_DIR/scripts"

# Funzioni per logging colorato
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# File per salvare PID del backend
BACKEND_PID_FILE="/tmp/skupper-backend.pid"

# Funzione di cleanup
cleanup() {
    log_info "Cleaning up..."
    
    # Termina il backend se è in esecuzione
    if [ -f "$BACKEND_PID_FILE" ]; then
        BACKEND_PID=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$BACKEND_PID" 2>/dev/null; then
            log_info "Stopping backend (PID: $BACKEND_PID)..."
            kill "$BACKEND_PID"
            wait "$BACKEND_PID" 2>/dev/null || true
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    
    # Termina eventuali processi PostgreSQL Docker se avviati da noi
    if docker ps -q --filter "name=skupper-postgres" | grep -q .; then
        log_info "Stopping PostgreSQL container..."
        docker stop skupper-postgres >/dev/null 2>&1 || true
    fi
    
    log_success "Cleanup completed"
    exit 0
}

# Trap per gestire interruzioni
trap cleanup SIGINT SIGTERM

# Verifica dipendenze
log_info "Checking dependencies..."

# Usa il sistema di check centralizzato
if [ -f "$SCRIPTS_DIR/check-dependencies.sh" ]; then
    log_info "Running comprehensive dependency check..."
    if ! "$SCRIPTS_DIR/check-dependencies.sh"; then
        log_error "Dependency check failed"
        exit 1
    fi
    log_success "All dependencies verified"
else
    # Fallback ai controlli manuali
    log_warning "Using fallback dependency checks..."
    
    # Verifica Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi

    # Verifica Node.js e Yarn
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed"
        exit 1
    fi

    if ! command -v yarn &> /dev/null; then
        log_error "Yarn is required but not installed"
        exit 1
    fi
    
    log_success "Basic dependencies available"
fi

# 1. Setup database
log_info "Setting up PostgreSQL database..."
if ! "$SCRIPTS_DIR/start-database.sh" setup; then
    log_error "Failed to setup database"
    exit 1
fi

# Aspetta che il database sia pronto
log_info "Waiting for database to be ready..."
sleep 5

# 2. Avvia il backend in background
log_info "Starting backend in background..."
cd "$PROJECT_DIR"

# Verifica dipendenze management controller
log_info "Checking backend dependencies..."
cd "$PROJECT_DIR/components/management-controller"
if [ -f "package.json" ]; then
    if [ ! -d "node_modules" ]; then
        log_info "Installing backend dependencies..."
        npm install >/dev/null 2>&1
    elif [ "package.json" -nt "node_modules" ] || [ -f "package-lock.json" -a "package-lock.json" -nt "node_modules" ]; then
        log_info "Backend dependencies are outdated, updating..."
        npm install >/dev/null 2>&1
    else
        log_success "Backend dependencies are up to date"
    fi
fi

cd "$PROJECT_DIR"

# Esporta variabili di ambiente per standalone
export SKX_STANDALONE_NAMESPACE=default
export PGUSER=access
export PGHOST=localhost
export PGPASSWORD=password
export PGDATABASE=studiodb
export PGPORT=5432
export SKX_CONTROLLER_NAME=standalone-controller
export NODE_ENV=development

# Avvia il backend e salva il PID
nohup node components/management-controller/index.js > /tmp/skupper-backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$BACKEND_PID_FILE"

log_success "Backend started with PID: $BACKEND_PID"
log_info "Backend logs: tail -f /tmp/skupper-backend.log"

# Aspetta che il backend sia pronto
log_info "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:8085/healthz >/dev/null 2>&1; then
        log_success "Backend is responding"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "Backend failed to start within 30 seconds"
        log_info "Check backend logs: tail -f /tmp/skupper-backend.log"
        cleanup
        exit 1
    fi
    sleep 1
done

# 3. Prepara e avvia il frontend
log_info "Setting up frontend console..."
cd "$PROJECT_DIR/components/console"

# Verifica e installa dipendenze se necessario
log_info "Checking frontend dependencies..."
if [ ! -d "node_modules" ]; then
    log_info "Installing frontend dependencies..."
    yarn install
else
    # Verifica se package.json è più recente di node_modules
    if [ "package.json" -nt "node_modules" ] || [ "yarn.lock" -nt "node_modules" ]; then
        log_info "Dependencies are outdated, updating..."
        yarn install
    else
        log_success "Dependencies are up to date"
    fi
fi

log_success "🎯 Development environment ready!"
echo ""
echo "📊 Services:"
echo "   • Backend API:  http://localhost:8085"
echo "   • Frontend:     http://localhost:3000"
echo "   • Database:     localhost:5432"
echo ""
echo "📝 Logs:"
echo "   • Backend:      tail -f /tmp/skupper-backend.log"
echo "   • Database:     docker logs -f skupper-postgres"
echo ""
echo "🔧 Development workflow:"
echo "   • Frontend has hot reload enabled"
echo "   • API calls are proxied to backend"
echo "   • Press Ctrl+C to stop all services"
echo ""

log_info "Starting frontend development server..."
log_warning "This will run in foreground - press Ctrl+C to stop everything"

# Avvia il frontend in foreground
yarn start