#!/bin/bash

# Script per avviare Skupper-X in modalità sviluppo
# Backend su porta 8085, Frontend su porta 3000

set -e

echo "🚀 Starting Skupper-X in Development Mode"
echo "========================================"

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directory di progetto
PROJECT_DIR="/home/vabar/Projects/skupper-X"
MANAGEMENT_CONTROLLER_DIR="$PROJECT_DIR/components/management-controller"
CONSOLE_DIR="$PROJECT_DIR/components/console"

# Configurazione database
DB_NAME="studiodb"
DB_USER="access"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"
POSTGRES_CONTAINER_NAME="skupper-postgres"

# PIDs dei processi
BACKEND_PID=""
FRONTEND_PID=""

# Funzione per logging colorato
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

# Funzione per cleanup
cleanup() {
    log_warning "Shutting down development services..."
    
    if [ ! -z "$FRONTEND_PID" ]; then
        log_info "Stopping Frontend Development Server..."
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$BACKEND_PID" ]; then
        log_info "Stopping Management Controller..."
        kill $BACKEND_PID 2>/dev/null || true
    fi
    
    log_info "PostgreSQL container remains running to preserve data"
    log_success "Development environment cleanup completed"
}

# Trap per cleanup automatico
trap cleanup EXIT INT TERM

# 1. Verifica prerequisiti
log_info "Checking prerequisites..."

# Verifica Node.js e yarn
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
fi

if ! command -v yarn &> /dev/null; then
    log_error "Yarn is not installed"
    exit 1
fi

# Verifica Docker e PostgreSQL
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running"
    exit 1
fi

log_success "All prerequisites are available"

# 2. Controlla PostgreSQL
log_info "Checking PostgreSQL container..."

if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
    log_success "PostgreSQL container is running"
elif docker ps -a | grep -q "$POSTGRES_CONTAINER_NAME"; then
    log_info "Starting PostgreSQL container..."
    docker start $POSTGRES_CONTAINER_NAME
    sleep 3
else
    log_info "Creating PostgreSQL container..."
    docker run -d \
        --name $POSTGRES_CONTAINER_NAME \
        -e POSTGRES_DB=$DB_NAME \
        -e POSTGRES_USER=$DB_USER \
        -e POSTGRES_PASSWORD=$DB_PASSWORD \
        -p $DB_PORT:5432 \
        -v skupper-postgres-data:/var/lib/postgresql/data \
        postgres:15-alpine
    
    log_info "Waiting for PostgreSQL to be ready..."
    sleep 8
    
    # Inizializza database se necessario
    if ! docker exec $POSTGRES_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "SELECT 1 FROM Configuration LIMIT 1;" >/dev/null 2>&1; then
        log_info "Initializing database schema..."
        docker cp "$PROJECT_DIR/scripts/db-setup.sql" $POSTGRES_CONTAINER_NAME:/tmp/db-setup.sql
        docker exec $POSTGRES_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -f /tmp/db-setup.sql
        docker exec $POSTGRES_CONTAINER_NAME rm /tmp/db-setup.sql
        log_success "Database initialized"
    fi
fi

# 3. Prepara environment variables per il backend
export SKX_STANDALONE_NAMESPACE=default
export PGUSER=$DB_USER
export PGHOST=$DB_HOST
export PGPASSWORD=$DB_PASSWORD
export PGDATABASE=$DB_NAME
export PGPORT=$DB_PORT
export SKX_CONTROLLER_NAME=dev-controller
export NODE_ENV=development

# 4. Avvia il Management Controller (Backend)
log_info "Starting Management Controller (Backend) on port 8085..."
cd "$MANAGEMENT_CONTROLLER_DIR"
node index.js &
BACKEND_PID=$!

# Attendi che il backend si avvii
sleep 5

if ! kill -0 $BACKEND_PID 2>/dev/null; then
    log_error "Management Controller failed to start"
    exit 1
fi

# Testa l'API
sleep 2
if curl -s http://localhost:8085/healthz >/dev/null 2>&1; then
    log_success "Backend API is responding at http://localhost:8085"
else
    log_warning "Backend API may still be starting..."
fi

# 5. Installa dipendenze della console se necessario
log_info "Checking console dependencies..."
cd "$CONSOLE_DIR"
if [ ! -d "node_modules" ]; then
    log_info "Installing console dependencies..."
    yarn install
fi

# 6. Avvia il Development Server della Console (Frontend)
log_info "Starting Console Development Server (Frontend) on port 3000..."
yarn start &
FRONTEND_PID=$!

# Attendi che il frontend si avvii
sleep 5

if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    log_error "Frontend Development Server failed to start"
    exit 1
fi

log_success "🎯 Development Environment Ready!"
echo ""
log_info "Services running:"
echo "  🔗 Frontend Console: http://localhost:3000"
echo "  🔗 Backend API:      http://localhost:8085"
echo "  🔗 Health Check:     http://localhost:8085/healthz"
echo ""
log_info "Frontend calls to /api/* and /compose/* will be proxied to the backend"
log_info "Press Ctrl+C to stop all services"
echo ""

# Mantieni lo script in esecuzione
wait
