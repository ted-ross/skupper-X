#!/bin/bash

# Script per installare e configurare solo il database PostgreSQL per Skupper-X
# Può essere usato indipendentemente dagli altri servizi

set -e  # Exit on any error

echo "🗄️  Setting up PostgreSQL Database for Skupper-X"
echo "================================================"

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directory di progetto
PROJECT_DIR="/home/vabar/Projects/skupper-X"

# Configurazione database (da postgres-config.yaml)
DB_NAME="studiodb"
DB_USER="access"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"
POSTGRES_CONTAINER_NAME="skupper-postgres"
POSTGRES_VOLUME_NAME="skupper-postgres-data"

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

# Funzione per mostrare lo stato del database
show_database_status() {
    log_info "Database Status:"
    echo "  Container Name: $POSTGRES_CONTAINER_NAME"
    echo "  Database Name:  $DB_NAME"
    echo "  User:          $DB_USER"
    echo "  Host:          $DB_HOST"
    echo "  Port:          $DB_PORT"
    echo "  Volume:        $POSTGRES_VOLUME_NAME"
    echo ""
    
    if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
        log_success "✅ PostgreSQL container is running"
    elif docker ps -a | grep -q "$POSTGRES_CONTAINER_NAME"; then
        log_warning "⚠️  PostgreSQL container exists but is stopped"
    else
        log_info "ℹ️  PostgreSQL container does not exist"
    fi
    
    if docker volume ls | grep -q "$POSTGRES_VOLUME_NAME"; then
        log_success "✅ PostgreSQL data volume exists"
    else
        log_info "ℹ️  PostgreSQL data volume does not exist"
    fi
}

# Funzione per rimuovere completamente il database
remove_database() {
    log_warning "This will PERMANENTLY DELETE all database data!"
    echo -n "Are you sure? Type 'yes' to confirm: "
    read confirmation
    
    if [ "$confirmation" = "yes" ]; then
        log_info "Removing PostgreSQL container and data..."
        
        # Stop and remove container
        if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
            docker stop $POSTGRES_CONTAINER_NAME
        fi
        
        if docker ps -a | grep -q "$POSTGRES_CONTAINER_NAME"; then
            docker rm $POSTGRES_CONTAINER_NAME
        fi
        
        # Remove volume
        if docker volume ls | grep -q "$POSTGRES_VOLUME_NAME"; then
            docker volume rm $POSTGRES_VOLUME_NAME
        fi
        
        log_success "Database completely removed"
    else
        log_info "Database removal cancelled"
    fi
}

# Parse command line arguments
case "${1:-setup}" in
    setup|install)
        ACTION="setup"
        ;;
    status)
        ACTION="status"
        ;;
    start)
        ACTION="start"
        ;;
    stop)
        ACTION="stop"
        ;;
    restart)
        ACTION="restart"
        ;;
    remove|delete)
        ACTION="remove"
        ;;
    logs)
        ACTION="logs"
        ;;
    psql|connect)
        ACTION="connect"
        ;;
    *)
        echo "Usage: $0 [setup|status|start|stop|restart|remove|logs|connect]"
        echo ""
        echo "Commands:"
        echo "  setup    - Install and configure PostgreSQL (default)"
        echo "  status   - Show database status"
        echo "  start    - Start PostgreSQL container"
        echo "  stop     - Stop PostgreSQL container"
        echo "  restart  - Restart PostgreSQL container"
        echo "  remove   - Completely remove database and data"
        echo "  logs     - Show PostgreSQL logs"
        echo "  connect  - Connect to database with psql"
        exit 1
        ;;
esac

# 1. Verifica prerequisiti
if [ "$ACTION" != "status" ]; then
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
    
    log_success "Prerequisites check passed"
fi

# Esegui l'azione richiesta
case "$ACTION" in
    setup)
        show_database_status
        echo ""
        
        # Assicurati che il container sia in esecuzione
        if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
            log_success "PostgreSQL container is already running"
        elif docker ps -a | grep -q "$POSTGRES_CONTAINER_NAME"; then
            # Container esiste ma è fermato - riavvialo
            log_info "Starting existing PostgreSQL container..."
            docker start $POSTGRES_CONTAINER_NAME
            if [ $? -eq 0 ]; then
                log_success "PostgreSQL container started successfully"
            else
                log_error "Failed to start PostgreSQL container"
                exit 1
            fi
        else
            # Nessun container esistente - creane uno nuovo e avvialo
            log_info "Creating and starting new PostgreSQL container..."
            
            # Crea e avvia nuovo container PostgreSQL con volume persistente
            docker run -d \
                --name $POSTGRES_CONTAINER_NAME \
                -e POSTGRES_DB=$DB_NAME \
                -e POSTGRES_USER=$DB_USER \
                -e POSTGRES_PASSWORD=$DB_PASSWORD \
                -p $DB_PORT:5432 \
                -v $POSTGRES_VOLUME_NAME:/var/lib/postgresql/data \
                postgres:15-alpine
            
            if [ $? -eq 0 ]; then
                log_success "PostgreSQL container created and started successfully"
            else
                log_error "Failed to create PostgreSQL container"
                exit 1
            fi
        fi
        
        # Attendi che PostgreSQL sia pronto
        sleep 5
        if ! wait_for_postgres_container; then
            log_error "PostgreSQL container failed to become ready"
            log_info "Check container logs with: $0 logs"
            exit 1
        fi
        
        # Inizializza il database se necessario
        log_info "Checking if database schema needs initialization..."
        
        if docker exec $POSTGRES_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "SELECT 1 FROM Configuration LIMIT 1;" >/dev/null 2>&1; then
            log_warning "Database already initialized, skipping schema setup"
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
        
        echo ""
        log_success "🎉 PostgreSQL setup completed successfully!"
        echo ""
        log_info "Connection details:"
        echo "  Host: $DB_HOST"
        echo "  Port: $DB_PORT"
        echo "  Database: $DB_NAME"
        echo "  User: $DB_USER"
        echo "  Password: $DB_PASSWORD"
        echo ""
        log_info "Environment variables for applications:"
        echo "  export PGHOST=$DB_HOST"
        echo "  export PGPORT=$DB_PORT"
        echo "  export PGDATABASE=$DB_NAME"
        echo "  export PGUSER=$DB_USER"
        echo "  export PGPASSWORD=$DB_PASSWORD"
        ;;
        
    status)
        show_database_status
        ;;
        
    start)
        if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
            log_warning "PostgreSQL container is already running"
        elif docker ps -a | grep -q "$POSTGRES_CONTAINER_NAME"; then
            log_info "Starting PostgreSQL container..."
            docker start $POSTGRES_CONTAINER_NAME
            log_success "PostgreSQL container started"
        else
            log_error "PostgreSQL container does not exist. Run '$0 setup' first."
            exit 1
        fi
        ;;
        
    stop)
        if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
            log_info "Stopping PostgreSQL container..."
            docker stop $POSTGRES_CONTAINER_NAME
            log_success "PostgreSQL container stopped"
        else
            log_warning "PostgreSQL container is not running"
        fi
        ;;
        
    restart)
        log_info "Restarting PostgreSQL container..."
        docker restart $POSTGRES_CONTAINER_NAME 2>/dev/null || {
            log_error "PostgreSQL container does not exist. Run '$0 setup' first."
            exit 1
        }
        log_success "PostgreSQL container restarted"
        ;;
        
    remove)
        remove_database
        ;;
        
    logs)
        if docker ps -a | grep -q "$POSTGRES_CONTAINER_NAME"; then
            docker logs -f $POSTGRES_CONTAINER_NAME
        else
            log_error "PostgreSQL container does not exist"
            exit 1
        fi
        ;;
        
    connect)
        if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
            log_info "Connecting to PostgreSQL database..."
            docker exec -it $POSTGRES_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME
        else
            log_error "PostgreSQL container is not running. Start it with '$0 start'"
            exit 1
        fi
        ;;
esac
