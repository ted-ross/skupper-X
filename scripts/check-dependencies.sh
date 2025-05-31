#!/bin/bash

# Script per verificare e installare tutte le dipendenze del progetto Skupper-X

set -e

echo "🔧 Checking and Installing Skupper-X Dependencies"
echo "================================================="

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directory di progetto
PROJECT_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
CONSOLE_DIR="$PROJECT_DIR/components/console"
MANAGEMENT_CONTROLLER_DIR="$PROJECT_DIR/components/management-controller"
SITE_CONTROLLER_DIR="$PROJECT_DIR/components/site-controller"

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

# Funzione per verificare se un comando esiste
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Funzione per verificare le dipendenze del sistema
check_system_dependencies() {
    log_info "Checking system dependencies..."
    
    local missing_deps=()
    
    # Verifica Node.js
    if command_exists node; then
        local node_version=$(node --version)
        log_success "Node.js $node_version installed"
        
        # Verifica versione minima Node.js (v16+)
        local major_version=$(echo $node_version | cut -d'.' -f1 | sed 's/v//')
        if [ "$major_version" -lt 16 ]; then
            log_warning "Node.js version $node_version is too old (minimum v16 required)"
        fi
    else
        log_error "Node.js is not installed"
        missing_deps+=("nodejs")
    fi
    
    # Verifica npm
    if command_exists npm; then
        local npm_version=$(npm --version)
        log_success "npm $npm_version installed"
    else
        log_error "npm is not installed"
        missing_deps+=("npm")
    fi
    
    # Verifica Yarn
    if command_exists yarn; then
        local yarn_version=$(yarn --version)
        log_success "Yarn $yarn_version installed"
    else
        log_warning "Yarn is not installed (optional but recommended)"
        log_info "Installing Yarn globally..."
        if npm install -g yarn >/dev/null 2>&1; then
            log_success "Yarn installed successfully"
        else
            log_error "Failed to install Yarn"
            missing_deps+=("yarn")
        fi
    fi
    
    # Verifica Docker
    if command_exists docker; then
        local docker_version=$(docker --version | cut -d' ' -f3 | sed 's/,//')
        log_success "Docker $docker_version installed"
        
        # Verifica se Docker daemon è in esecuzione
        if docker info >/dev/null 2>&1; then
            log_success "Docker daemon is running"
        else
            log_warning "Docker daemon is not running"
        fi
    else
        log_error "Docker is not installed"
        missing_deps+=("docker")
    fi
    
    # Verifica curl
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
        echo "For other systems, please install the missing dependencies manually."
        exit 1
    fi
    
    log_success "All system dependencies are available"
}

# Funzione per verificare e installare dipendenze di un progetto
check_project_dependencies() {
    local project_name="$1"
    local project_dir="$2"
    local package_manager="$3"  # npm o yarn
    
    log_info "Checking $project_name dependencies..."
    
    if [ ! -d "$project_dir" ]; then
        log_error "$project_name directory not found: $project_dir"
        return 1
    fi
    
    cd "$project_dir"
    
    # Verifica se package.json esiste
    if [ ! -f "package.json" ]; then
        log_warning "$project_name has no package.json file"
        return 0
    fi
    
    # Verifica se node_modules esiste
    if [ ! -d "node_modules" ]; then
        log_info "Installing $project_name dependencies with $package_manager..."
        if [ "$package_manager" = "yarn" ]; then
            if yarn install; then
                log_success "$project_name dependencies installed"
            else
                log_error "Failed to install $project_name dependencies"
                return 1
            fi
        else
            if npm install; then
                log_success "$project_name dependencies installed"
            else
                log_error "Failed to install $project_name dependencies"
                return 1
            fi
        fi
    else
        # Verifica se le dipendenze sono aggiornate
        local needs_update=false
        
        if [ "package.json" -nt "node_modules" ]; then
            needs_update=true
        fi
        
        if [ "$package_manager" = "yarn" ] && [ -f "yarn.lock" ] && [ "yarn.lock" -nt "node_modules" ]; then
            needs_update=true
        fi
        
        if [ "$package_manager" = "npm" ] && [ -f "package-lock.json" ] && [ "package-lock.json" -nt "node_modules" ]; then
            needs_update=true
        fi
        
        if [ "$needs_update" = true ]; then
            log_info "Updating $project_name dependencies..."
            if [ "$package_manager" = "yarn" ]; then
                if yarn install; then
                    log_success "$project_name dependencies updated"
                else
                    log_error "Failed to update $project_name dependencies"
                    return 1
                fi
            else
                if npm install; then
                    log_success "$project_name dependencies updated"
                else
                    log_error "Failed to update $project_name dependencies"
                    return 1
                fi
            fi
        else
            log_success "$project_name dependencies are up to date"
        fi
    fi
}

# Funzione per verificare la vulnerabilità delle dipendenze
check_security() {
    log_info "Checking for security vulnerabilities..."
    
    # Console (Yarn)
    if [ -d "$CONSOLE_DIR/node_modules" ]; then
        cd "$CONSOLE_DIR"
        log_info "Checking console security..."
        if yarn audit --json >/dev/null 2>&1; then
            local high_vulns=$(yarn audit --json 2>/dev/null | grep '"type":"auditSummary"' | jq -r '.data.vulnerabilities.high // 0' 2>/dev/null || echo "0")
            local critical_vulns=$(yarn audit --json 2>/dev/null | grep '"type":"auditSummary"' | jq -r '.data.vulnerabilities.critical // 0' 2>/dev/null || echo "0")
            
            if [ "$high_vulns" -gt 0 ] || [ "$critical_vulns" -gt 0 ]; then
                log_warning "Found $high_vulns high and $critical_vulns critical vulnerabilities in console"
                log_info "Run 'yarn audit --fix' in $CONSOLE_DIR to fix"
            else
                log_success "No high/critical vulnerabilities found in console"
            fi
        fi
    fi
    
    # Management Controller (npm)
    if [ -d "$MANAGEMENT_CONTROLLER_DIR/node_modules" ]; then
        cd "$MANAGEMENT_CONTROLLER_DIR"
        log_info "Checking management controller security..."
        if npm audit --json >/dev/null 2>&1; then
            local audit_result=$(npm audit --json 2>/dev/null || echo '{}')
            local high_vulns=$(echo "$audit_result" | jq -r '.metadata.vulnerabilities.high // 0' 2>/dev/null || echo "0")
            local critical_vulns=$(echo "$audit_result" | jq -r '.metadata.vulnerabilities.critical // 0' 2>/dev/null || echo "0")
            
            if [ "$high_vulns" -gt 0 ] || [ "$critical_vulns" -gt 0 ]; then
                log_warning "Found $high_vulns high and $critical_vulns critical vulnerabilities in management controller"
                log_info "Run 'npm audit fix' in $MANAGEMENT_CONTROLLER_DIR to fix"
            else
                log_success "No high/critical vulnerabilities found in management controller"
            fi
        fi
    fi
}

# Funzione principale
main() {
    local check_security_flag=false
    local force_install=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --security|-s)
                check_security_flag=true
                shift
                ;;
            --force|-f)
                force_install=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --security, -s    Check for security vulnerabilities"
                echo "  --force, -f      Force reinstall all dependencies"
                echo "  --help, -h       Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Se force è abilitato, rimuovi node_modules
    if [ "$force_install" = true ]; then
        log_info "Force reinstall requested - removing existing node_modules..."
        rm -rf "$CONSOLE_DIR/node_modules" 2>/dev/null || true
        rm -rf "$MANAGEMENT_CONTROLLER_DIR/node_modules" 2>/dev/null || true
        rm -rf "$SITE_CONTROLLER_DIR/node_modules" 2>/dev/null || true
    fi
    
    # Verifica dipendenze del sistema
    check_system_dependencies
    echo ""
    
    # Verifica dipendenze dei progetti
    check_project_dependencies "Console" "$CONSOLE_DIR" "yarn"
    echo ""
    
    check_project_dependencies "Management Controller" "$MANAGEMENT_CONTROLLER_DIR" "npm"
    echo ""
    
    check_project_dependencies "Site Controller" "$SITE_CONTROLLER_DIR" "npm"
    echo ""
    
    # Verifica sicurezza se richiesto
    if [ "$check_security_flag" = true ]; then
        check_security
        echo ""
    fi
    
    log_success "🎉 All dependencies check completed!"
    echo ""
    echo "📋 What's next?"
    echo "   • Start development: ./scripts/start-dev-mode.sh"
    echo "   • Start standalone:  ./scripts/start-skupper-standalone.sh"
    echo "   • Start frontend:    ./scripts/start-console-dev.sh"
    echo ""
    echo "🔒 Security:"
    echo "   • Check vulnerabilities: $0 --security"
    echo "   • Force reinstall:       $0 --force"
}

# Esegui funzione principale
main "$@"
