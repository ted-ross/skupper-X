#!/bin/bash

# Script completo per avviare Skupper-X in modalità standalone
# Usa PostgreSQL con Docker

set -e  # Exit on any error

echo "🚀 Starting Skupper-X in Standalone Mode (Docker PostgreSQL)"
echo "============================================================"

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

# Configurazione database (da postgres-config.yaml)
DB_NAME="studiodb"
DB_USER="access"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"
POSTGRES_CONTAINER_NAME="skupper-postgres"

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

# Funzione per controllare se PostgreSQL container è pronto
wait_for_postgres_container() {
    log_info "Waiting for PostgreSQL container to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec $POSTGRES_CONTAINER_NAME pg_isready -U $DB_USER >/dev/null 2>&1; then
            log_success "PostgreSQL container is ready!"
            return 0
        fi
        
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log_error "PostgreSQL container failed to become ready"
    return 1
}

# Funzione per buildare la console e il management controller
build_console_and_controller() {
    log_info "Building console and management controller..."
    
    # Check if yarn is available
    if ! command -v yarn &> /dev/null; then
        log_error "Yarn is not installed or not in PATH"
        log_warning "Install yarn first: npm install -g yarn"
        return 1
    fi
    
    # Build console
    log_info "Building console (React app)..."
    cd "$CONSOLE_DIR"
    if ! yarn install >/dev/null 2>&1; then
        log_error "Failed to install console dependencies"
        return 1
    fi
    
    if ! yarn build >/dev/null 2>&1; then
        log_error "Failed to build console"
        return 1
    fi
    log_success "Console built successfully"
    
    # Build management controller (includes console integration)
    log_info "Building management controller with integrated console..."
    cd "$MANAGEMENT_CONTROLLER_DIR"
    if ! node build.js; then
        log_error "Failed to build management controller"
        return 1
    fi
    log_success "Management controller built successfully"
    
    return 0
}

# Funzione per pulire i processi in uscita
cleanup() {
    log_warning "Shutting down services..."
    if [ ! -z "$CONTROLLER_PID" ]; then
        log_info "Stopping Management Controller..."
        kill $CONTROLLER_PID 2>/dev/null || true
    fi
    
    # ✅ NON fermiamo il container PostgreSQL - rimane in esecuzione per preservare i dati
    log_info "PostgreSQL container remains running to preserve data"
    log_info "To stop PostgreSQL manually: docker stop $POSTGRES_CONTAINER_NAME"
    
    log_success "Cleanup completed"
}

# Trap per cleanup automatico
trap cleanup EXIT INT TERM

# 1. Verifica prerequisiti
log_info "Checking prerequisites..."

# Verifica Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH"
    log_warning "Install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Verifica che Docker sia in esecuzione
if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running"
    log_warning "Start Docker with: sudo systemctl start docker"
    exit 1
fi

# Verifica Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed or not in PATH"
    exit 1
fi

log_success "All prerequisites are available"

# 2. Build console and management controller
log_info "Building console and management controller..."
if ! build_console_and_controller; then
    log_error "Build process failed"
    exit 1
fi

# 3. Avvia PostgreSQL in Docker se non è già in esecuzione
log_info "Checking PostgreSQL container status..."

if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
    log_success "PostgreSQL container is already running"
elif docker ps -a | grep -q "$POSTGRES_CONTAINER_NAME"; then
    # Container esiste ma è fermato - riavvialo
    log_info "Starting existing PostgreSQL container..."
    docker start $POSTGRES_CONTAINER_NAME
    if [ $? -eq 0 ]; then
        log_success "PostgreSQL container restarted successfully"
    else
        log_error "Failed to restart PostgreSQL container"
        exit 1
    fi
else
    # Nessun container esistente - creane uno nuovo
    log_info "Creating new PostgreSQL container..."
    
    # Avvia nuovo container PostgreSQL con volume persistente
    docker run -d \
        --name $POSTGRES_CONTAINER_NAME \
        -e POSTGRES_DB=$DB_NAME \
        -e POSTGRES_USER=$DB_USER \
        -e POSTGRES_PASSWORD=$DB_PASSWORD \
        -p $DB_PORT:5432 \
        -v skupper-postgres-data:/var/lib/postgresql/data \
        postgres:15-alpine
    
    if [ $? -eq 0 ]; then
        log_success "PostgreSQL container created successfully"
    else
        log_error "Failed to create PostgreSQL container"
        exit 1
    fi
fi

# 4. Attendi che PostgreSQL container sia pronto
log_info "Waiting for PostgreSQL container to be ready..."
sleep 5

if ! wait_for_postgres_container; then
    log_error "PostgreSQL container failed to become ready"
    log_info "Check container logs with: docker logs $POSTGRES_CONTAINER_NAME"
    exit 1
fi

# 5. Inizializza il database usando Docker exec (se necessario)
log_info "Checking if database schema needs initialization..."

# Usa docker exec per eseguire i comandi SQL
if docker exec $POSTGRES_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "SELECT 1 FROM Configuration LIMIT 1;" >/dev/null 2>&1; then
    log_warning "Database already initialized, skipping setup"
else
    log_info "Initializing database schema..."
    
    # Copia il file SQL nel container e eseguilo
    docker cp "$PROJECT_DIR/scripts/db-setup.sql" $POSTGRES_CONTAINER_NAME:/tmp/db-setup.sql
    
    if docker exec $POSTGRES_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -f /tmp/db-setup.sql; then
        log_success "Database schema initialized successfully"
        # Rimuovi il file temporaneo
        docker exec $POSTGRES_CONTAINER_NAME rm /tmp/db-setup.sql
    else
        log_error "Database initialization failed"
        exit 1
    fi
fi

# 6. Configura variabili d'ambiente per modalità standalone
log_info "Setting up environment variables..."
export SKX_STANDALONE_NAMESPACE=default
export PGUSER=$DB_USER
export PGHOST=$DB_HOST
export PGPASSWORD=$DB_PASSWORD
export PGDATABASE=$DB_NAME
export PGPORT=$DB_PORT
export SKX_CONTROLLER_NAME=standalone-controller
export NODE_ENV=development

log_success "Environment variables configured"

# 7. Avvia il management controller
log_info "Starting Skupper-X Management Controller with integrated console..."
echo ""
log_info "Environment configuration:"
echo "  SKX_STANDALONE_NAMESPACE: $SKX_STANDALONE_NAMESPACE"
echo "  PGHOST: $PGHOST"
echo "  PGDATABASE: $PGDATABASE"
echo "  SKX_CONTROLLER_NAME: $SKX_CONTROLLER_NAME"
echo ""

log_success "🎯 Skupper-X Management Controller starting..."
log_info "API will be available at: http://localhost:8085/api/v1alpha1/"
log_info "Web Console will be available at: http://localhost:8085/"
log_info "Press Ctrl+C to stop all services"
echo ""

# Avvia il controller dalla directory buildato (app/) invece del sorgente
cd "$MANAGEMENT_CONTROLLER_DIR/app"
node index.js &
CONTROLLER_PID=$!

# Attendi che il controller si avvii o fallisca
sleep 5

if kill -0 $CONTROLLER_PID 2>/dev/null; then
    log_success "Management Controller is running (PID: $CONTROLLER_PID)"
    
    # Testa l'API
    sleep 3
    if curl -s http://localhost:8085/healthz >/dev/null 2>&1; then
        log_success "API server is responding at http://localhost:8085"
    else
        log_warning "API server may still be starting up..."
    fi
    
    # Mantieni lo script in esecuzione
    log_info "Services are running. Use Ctrl+C to stop."
    wait $CONTROLLER_PID
else
    log_error "Management Controller failed to start"
    exit 1
fi
