#!/bin/bash

# ==============================================================================
# Skupper-X Development Environment Startup Script
# ==============================================================================
# This script sets up a complete local development environment:
# - Runs backend (Management Controller) on port 8085 with hot reload
# - Runs frontend (Console) on port 3000 with development server
# - Uses PostgreSQL in Docker container for data persistence
# - Connects to Kubernetes cluster using kubectl config (not standalone mode)
#
# Prerequisites:
# - Node.js and npm (for backend)
# - Yarn (for frontend)
# - Docker (for PostgreSQL)
# - kubectl and minikube (for Kubernetes connectivity)
# ==============================================================================

# ==============================================================================
# CONFIGURABLE ENVIRONMENT VARIABLES
# ==============================================================================
# You can customize these variables by setting them before running the script:
#
# DATABASE CONFIGURATION:
#   DB_NAME="studiodb"              # PostgreSQL database name
#   DB_USER="access"                # PostgreSQL username
#   DB_PASSWORD="password"          # PostgreSQL password
#   DB_HOST="localhost"             # PostgreSQL host (use localhost for container)
#   DB_PORT="5432"                  # PostgreSQL port
#   POSTGRES_CONTAINER_NAME="skupper-postgres"  # Docker container name
#
# NODE.JS/BACKEND CONFIGURATION:
#   NODE_ENV="development"          # Node.js environment (development/production)
#   SKX_CONTROLLER_NAME="dev-controller"        # Skupper-X controller identifier
#   SKX_DEVELOPMENT_MODE="true"     # Enable development mode features
#   SKX_STANDALONE_NAMESPACE="default"          # Kubernetes namespace to use
#
# POSTGRESQL CONNECTION (Auto-configured from DB_* variables):
#   PGUSER="access"                 # PostgreSQL user for node-postgres
#   PGHOST="localhost"              # PostgreSQL host for node-postgres
#   PGPASSWORD="password"           # PostgreSQL password for node-postgres
#   PGDATABASE="studiodb"           # PostgreSQL database for node-postgres
#   PGPORT="5432"                   # PostgreSQL port for node-postgres
#
# PROJECT PATHS (Auto-detected, can be overridden):
#   PROJECT_DIR="/home/vabar/Projects/skupper-X"             # Main project directory
#   MANAGEMENT_CONTROLLER_DIR="$PROJECT_DIR/components/management-controller"
#   CONSOLE_DIR="$PROJECT_DIR/components/console"
#   YAML_DIR="$PROJECT_DIR/yaml"
#
# EXAMPLE USAGE:
#   # Use custom database settings:
#   DB_NAME="mydb" DB_USER="myuser" DB_PASSWORD="mypass" ./start-dev.sh
#
#   # Use different controller name:
#   SKX_CONTROLLER_NAME="my-controller" ./start-dev.sh
#
#   # Use different Kubernetes namespace:
#   SKX_STANDALONE_NAMESPACE="my-namespace" ./start-dev.sh
# ==============================================================================

# Exit immediately if any command fails
set -e

# ==============================================================================
# COMMAND LINE ARGUMENT PARSING
# ==============================================================================
# Parse and validate command line options for development mode
SKIP_PACKAGE_CHECK=false
CHECK_DEPS_ONLY=false
UPDATE_PACKAGES_ONLY=false

for arg in "$@"; do
    case $arg in
        --skip-package-check)
            SKIP_PACKAGE_CHECK=true
            shift
            ;;
        --check-deps)
            CHECK_DEPS_ONLY=true
            shift
            ;;
        --update-packages)
            UPDATE_PACKAGES_ONLY=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-package-check    Skip checking for outdated packages"
            echo "  --check-deps            Only check and install system dependencies (exit after)"
            echo "  --update-packages       Only update outdated packages (exit after)"
            echo "  --help, -h              Show this help message"
            echo ""
            echo "This script starts the Skupper-X development environment with:"
            echo "  - Backend API on port 8085 (with hot reload)"
            echo "  - Frontend Console on port 3000"
            echo "  - PostgreSQL database in Docker container"
            echo "  - Connection to local Kubernetes cluster (minikube)"
            echo ""
            echo "Examples:"
            echo "  $0                           # Start development environment"
            echo "  $0 --skip-package-check      # Start without checking package updates"
            echo "  $0 --check-deps              # Only check system dependencies"
            echo "  $0 --update-packages         # Only update outdated packages"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "🚀 Starting Skupper-X"
echo "===================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project directories
PROJECT_DIR="/home/vabar/Projects/skupper-X"
MANAGEMENT_CONTROLLER_DIR="$PROJECT_DIR/components/management-controller"
CONSOLE_DIR="$PROJECT_DIR/components/console"
YAML_DIR="$PROJECT_DIR/yaml"

# Database configuration
DB_NAME="studiodb"
DB_USER="access"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"
POSTGRES_CONTAINER_NAME="skupper-postgres"

# Process PIDs for development services
BACKEND_PID=""
FRONTEND_PID=""

# Functions for colored logging
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

# ==============================================================================
# SYSTEM DEPENDENCIES FUNCTIONS
# ==============================================================================

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check and install system dependencies
check_system_dependencies() {
    log_info "Checking system dependencies..."
    
    local missing_deps=()
    
    # Check Node.js
    if command_exists node; then
        local node_version=$(node --version)
        log_success "Node.js $node_version installed"
        
        # Check minimum Node.js version (v16+)
        local major_version=$(echo $node_version | cut -d'.' -f1 | sed 's/v//')
        if [ "$major_version" -lt 16 ]; then
            log_warning "Node.js version $node_version is too old (minimum v16 required)"
        fi
    else
        log_error "Node.js is not installed"
        missing_deps+=("nodejs")
    fi
    
    # Check npm
    if command_exists npm; then
        local npm_version=$(npm --version)
        log_success "npm $npm_version installed"
    else
        log_error "npm is not installed"
        missing_deps+=("npm")
    fi
    
    # Check Yarn
    if command_exists yarn; then
        local yarn_version=$(yarn --version)
        log_success "Yarn $yarn_version installed"
    else
        log_warning "Yarn is not installed, installing globally..."
        if npm install -g yarn >/dev/null 2>&1; then
            log_success "Yarn installed successfully"
        else
            log_error "Failed to install Yarn"
            missing_deps+=("yarn")
        fi
    fi
    
    # Check Docker
    if command_exists docker; then
        local docker_version=$(docker --version | cut -d' ' -f3 | sed 's/,//')
        log_success "Docker $docker_version installed"
        
        # Check if Docker daemon is running
        if docker info >/dev/null 2>&1; then
            log_success "Docker daemon is running"
        else
            log_warning "Docker daemon is not running"
        fi
    else
        log_error "Docker is not installed"
        missing_deps+=("docker")
    fi
    
    # Check kubectl
    if command_exists kubectl; then
        local kubectl_version=$(kubectl version --client --short 2>/dev/null | cut -d' ' -f3 || echo "unknown")
        log_success "kubectl $kubectl_version installed"
    else
        log_error "kubectl is not installed"
        missing_deps+=("kubectl")
    fi
    
    # Check minikube
    if command_exists minikube; then
        local minikube_version=$(minikube version --short)
        log_success "minikube $minikube_version installed"
    else
        log_error "minikube is not installed"
        missing_deps+=("minikube")
    fi
    
    # Check curl
    if command_exists curl; then
        log_success "curl installed"
    else
        log_error "curl is not installed"
        missing_deps+=("curl")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing system dependencies: ${missing_deps[*]}"
        echo ""
        echo "To install missing dependencies on Ubuntu/Debian:"
        echo "  sudo apt update"
        echo "  sudo apt install nodejs npm docker.io curl"
        echo ""
        echo "For kubectl and minikube, please visit:"
        echo "  https://kubernetes.io/docs/tasks/tools/install-kubectl/"
        echo "  https://minikube.sigs.k8s.io/docs/start/"
        exit 1
    fi
    
    log_success "All system dependencies are available"
}

# ==============================================================================
# PACKAGE UPDATE FUNCTIONS
# ==============================================================================

# Function to update npm packages with user confirmation
update_npm_packages() {
    local dir=$1
    local component_name=$2
    
    log_info "Updating packages for $component_name..."
    cd "$dir"
    
    # Show outdated packages first
    local outdated_output=$(npm outdated 2>/dev/null)
    if [ -n "$outdated_output" ]; then
        log_warning "Outdated packages in $component_name:"
        echo "$outdated_output"
        echo ""
        
        # Update packages
        log_info "Running npm update..."
        if npm update; then
            log_success "Packages updated successfully for $component_name"
        else
            log_error "Failed to update packages for $component_name"
            return 1
        fi
    else
        log_success "All packages are already up to date for $component_name"
    fi
}

# Function to update yarn packages with user confirmation
update_yarn_packages() {
    local dir=$1
    local component_name=$2
    
    log_info "Updating packages for $component_name..."
    cd "$dir"
    
    # Show outdated packages first
    local outdated_output=$(yarn outdated 2>/dev/null | grep -v "yarn outdated" | grep -v "warning" || true)
    if [ -n "$outdated_output" ]; then
        log_warning "Outdated packages in $component_name:"
        echo "$outdated_output"
        echo ""
        
        # Update packages
        log_info "Running yarn upgrade..."
        if yarn upgrade; then
            log_success "Packages updated successfully for $component_name"
        else
            log_error "Failed to update packages for $component_name"
            return 1
        fi
    else
        log_success "All packages are already up to date for $component_name"
    fi
}

# Function to handle package updates for all components
handle_package_updates() {
    echo "📦 Updating Skupper-X Package Dependencies"
    echo "=========================================="
    echo ""
    echo "This will update all outdated packages in both components."
    echo ""
    read -p "Continue? [y/N]: " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Update cancelled"
        exit 0
    fi
    
    # Update Management Controller packages (npm)
    log_info "=== Updating Management Controller packages ==="
    if ! update_npm_packages "$MANAGEMENT_CONTROLLER_DIR" "Management Controller"; then
        log_error "Failed to update Management Controller packages"
        exit 1
    fi
    
    echo ""
    
    # Update Console packages (yarn)
    log_info "=== Updating Console packages ==="
    if ! update_yarn_packages "$CONSOLE_DIR" "Console"; then
        log_error "Failed to update Console packages"
        exit 1
    fi
    
    echo ""
    log_success "🎯 All packages updated successfully!"
    log_info "You can now run the development environment:"
    log_info "  ./scripts/start-dev.sh --skip-package-check"
}

# ==============================================================================
# PACKAGE MANAGEMENT FUNCTIONS
# ==============================================================================

# Function to check for outdated packages in a Node.js project directory
# This helps identify when dependencies need updates for security or features
check_outdated_packages() {
    local dir=$1              # Directory path containing package.json
    local component_name=$2   # Human-readable name for logging
    
    log_info "Checking outdated packages for $component_name..."
    cd "$dir"
    
    # Run npm outdated and capture output (suppress error messages)
    local outdated_output=$(npm outdated 2>/dev/null)
    
    if [ -n "$outdated_output" ]; then
        log_warning "Found outdated packages in $component_name:"
        echo "$outdated_output"
        echo ""
        log_info "To update packages, run:"
        log_info "  ./scripts/start-dev.sh --update-packages"
        log_info "Or to skip this check: ./scripts/start-dev.sh --skip-package-check"
        echo ""
    else
        log_success "All packages are up to date for $component_name"
    fi
}

# Function to ensure backend dependencies are installed
# Checks if node_modules exists and installs dependencies if missing
ensure_backend_dependencies() {
    cd "$MANAGEMENT_CONTROLLER_DIR"
    
    # Check if node_modules directory exists and has content
    if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
        log_info "Installing Management Controller dependencies..."
        npm install
        log_success "Management Controller dependencies installed"
    else
        # Check if specific critical dependencies exist
        if [ ! -d "node_modules/@kubernetes" ] || [ ! -d "node_modules/express" ]; then
            log_warning "Some dependencies appear to be missing, reinstalling..."
            npm install
            log_success "Management Controller dependencies reinstalled"
        else
            log_success "Management Controller dependencies are already installed"
        fi
    fi
}

# Note: Using npx nodemon instead of installing as dependency
# This avoids adding nodemon to package.json devDependencies

# ==============================================================================
# KUBERNETES CONNECTIVITY FUNCTIONS
# ==============================================================================

# Function to verify Kubernetes cluster connectivity
# Ensures kubectl is available and cluster is accessible for development
check_kubernetes() {
    log_info "Checking Kubernetes connectivity..."
    
    # Verify kubectl is installed and in PATH
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    # Test cluster connectivity
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_success "Kubernetes cluster is accessible"
}

# Function for cleanup
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
    
    # Stop and remove PostgreSQL container
    if docker ps | grep -q "$POSTGRES_CONTAINER_NAME"; then
        log_info "Stopping PostgreSQL container..."
        docker stop $POSTGRES_CONTAINER_NAME >/dev/null 2>&1 || true
        log_success "PostgreSQL container stopped"
    fi
    
    if docker ps -a | grep -q "$POSTGRES_CONTAINER_NAME"; then
        log_info "Removing PostgreSQL container..."
        docker rm $POSTGRES_CONTAINER_NAME >/dev/null 2>&1 || true
        log_success "PostgreSQL container removed"
    fi
    
    log_warning "Note: PostgreSQL data volume 'skupper-postgres-data' is preserved"
    log_info "To remove data volume as well, run: docker volume rm skupper-postgres-data"
    log_success "Development environment cleanup completed"
}

# Trap for automatic cleanup
trap cleanup EXIT INT TERM

# Handle special modes first (after function definitions)
if [ "$CHECK_DEPS_ONLY" = true ]; then
    echo "🔧 Checking Skupper-X Dependencies Only"
    echo "======================================="
    check_system_dependencies
    exit 0
fi

if [ "$UPDATE_PACKAGES_ONLY" = true ]; then
    handle_package_updates
    exit 0
fi

# 1. Check common prerequisites
log_info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running"
    exit 1
fi

log_success "Basic prerequisites are available"

# Function to check and start minikube
check_and_start_minikube() {
    log_info "Checking minikube setup..."
    
    # Check if minikube is installed
    if ! command -v minikube &> /dev/null; then
        log_error "minikube is not installed"
        log_error "Please install minikube first: https://minikube.sigs.k8s.io/docs/start/"
        exit 1
    fi
    
    # Check if minikube is running
    if ! minikube status >/dev/null 2>&1; then
        log_warning "minikube is not running, starting it..."
        minikube start
        if [ $? -ne 0 ]; then
            log_error "Failed to start minikube"
            exit 1
        fi
        log_success "minikube started successfully"
    else
        log_success "minikube is already running"
    fi
    
    # Wait for minikube to be fully operational
    log_info "Waiting for minikube to be fully operational..."
    kubectl wait --for=condition=Ready nodes --all --timeout=300s
    if [ $? -ne 0 ]; then
        log_error "minikube nodes are not ready after 5 minutes"
        exit 1
    fi
    
    log_success "minikube cluster is fully operational"
}

# Check minikube for development mode (necessary for Kubernetes connectivity)
check_and_start_minikube

# 2. Start local development environment
log_info "💻 Starting local development environment"
log_info "Backend will run in Kubernetes mode (using kubectl config)"
    
# Check yarn for frontend
if ! command -v yarn &> /dev/null; then
    log_error "Yarn is not installed (needed for frontend)"
    exit 1
fi
    
    # Check for outdated packages (unless skipped)
if [ "$SKIP_PACKAGE_CHECK" = false ]; then
    check_outdated_packages "$MANAGEMENT_CONTROLLER_DIR" "Management Controller"
    check_outdated_packages "$CONSOLE_DIR" "Console"
else
    log_info "Skipping package check (--skip-package-check flag provided)"
fi

# Ensure backend dependencies are installed
ensure_backend_dependencies

# Using npx nodemon (no need to install as dependency)
log_info "Will use npx nodemon for hot reload (no installation required)"

# 3. Setup PostgreSQL container
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
        
        # Initialize database if necessary
        if ! docker exec $POSTGRES_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "SELECT 1 FROM Configuration LIMIT 1;" >/dev/null 2>&1; then
            log_info "Initializing database schema..."
            docker cp "$PROJECT_DIR/scripts/db-setup.sql" $POSTGRES_CONTAINER_NAME:/tmp/db-setup.sql
            docker exec $POSTGRES_CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -f /tmp/db-setup.sql
            docker exec $POSTGRES_CONTAINER_NAME rm /tmp/db-setup.sql
            log_success "Database initialized"
        fi
    fi

# 4. Configure environment variables for backend (Kubernetes mode)
export NODE_ENV=development
export PGUSER=$DB_USER
export PGHOST=$DB_HOST
export PGPASSWORD=$DB_PASSWORD
export PGDATABASE=$DB_NAME
export PGPORT=$DB_PORT
export SKX_CONTROLLER_NAME=dev-controller
export SKX_DEVELOPMENT_MODE=true
# Set SKX_STANDALONE_NAMESPACE to force use of kubectl config instead of service account
export SKX_STANDALONE_NAMESPACE=default

log_info "Environment configured for Kubernetes development mode (using kubectl config, namespace: default)"
    
# 5. Start Management Controller (Backend) with nodemon for hot reload
log_info "Starting Management Controller (Backend) with hot reload on port 8085..."
cd "$MANAGEMENT_CONTROLLER_DIR"

# Run nodemon directly with inline configuration (equivalent to nodemon.json)
npx nodemon \
    --watch src/ \
    --watch index.js \
    --ignore node_modules/ \
    --ignore app/ \
    --ignore build/ \
    --ignore "*.test.js" \
    --ignore "*.spec.js" \
    --ignore logs/ \
    --ignore tmp/ \
    --ext js,json,yaml,yml \
    --delay 1000 \
    --inspect=0.0.0.0:9229 \
    index.js &
BACKEND_PID=$!
    
# Wait for backend to start
sleep 5

if ! kill -0 $BACKEND_PID 2>/dev/null; then
    log_error "Management Controller failed to start"
    exit 1
fi

# Test the API
sleep 3
if curl -s http://localhost:8085/healthz >/dev/null 2>&1; then
    log_success "Backend API is responding at http://localhost:8085"
else
    log_warning "Backend API may still be starting..."
fi

# 6. Install console dependencies if necessary
log_info "Checking console dependencies..."
cd "$CONSOLE_DIR"
if [ ! -d "node_modules" ]; then
    log_info "Installing console dependencies..."
    yarn install
fi

# 7. Start Console Development Server (Frontend)
log_info "Starting Console Development Server (Frontend) on port 3000..."
yarn start &
FRONTEND_PID=$!

# Wait for frontend to start
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
log_info "Backend is running in KUBERNETES mode (will try to connect to k8s cluster)"
log_info "Make sure you have kubectl configured for your minikube cluster"
echo ""
log_info "Frontend calls to /api/* and /compose/* will be proxied to the backend"
log_info "Press Ctrl+C to stop all services"
echo ""

# Keep script running
wait
