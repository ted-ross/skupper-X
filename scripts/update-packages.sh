#!/bin/bash

# Script to update all packages in Skupper-X components

set -e

echo "📦 Updating Skupper-X Package Dependencies"
echo "=========================================="

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

# Function to update npm packages
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

# Function to update yarn packages
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

# Main execution
echo "This script will update all outdated packages in both components."
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
log_info "  ./scripts/start-dev-mode.sh --skip-package-check"
