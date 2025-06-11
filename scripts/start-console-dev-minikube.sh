#!/bin/bash

# Skupper-X Console Development Environment Setup Script
# 
# PREREQUISITES:
#   - minikube (running with sufficient resources: --cpus=4 --memory=8g)
#   - kubectl (configured to connect to your minikube cluster)
#   - Docker (for building controller images)
#   - Node.js and npm (for building the console frontend)
#   - yarn (npm install -g yarn)
#   - Python 3 (for UUID generation)
#
# SETUP REQUIREMENTS:
#   1. Start minikube first:
#      minikube start --cpus=4 --memory=8g --driver=docker
#      
#      Or with a specific profile:
#      minikube start -p my-profile --cpus=4 --memory=8g --driver=docker
#
#   2. Ensure you're in the correct project directory (skupper-X)
#   3. Run this script from the scripts directory: ./start-console-dev
# 
# This script sets up a complete Skupper-X development environment with automatic Docker image building.
# 
# KUBERNETES DEPLOYMENT:
#   - PostgreSQL database (with persistent storage and schema initialization)
#   - Management Controller API (with auto-built Docker image)
#   - Site Controller with Skupper Router sidecar (with auto-built Docker image)
#   - cert-manager for certificate management with self-signed CA
#   - Skupper v2 CRDs and controller
#   - All necessary RBAC and networking configuration
#   - Automatic namespace creation and configuration
# 
# LOCAL DEVELOPMENT:
#   - Console frontend with hot reload at http://localhost:3000 (default)
#   - Management Controller API accessible via port-forward at http://localhost:8085/api/v1alpha1 (default)
#   - Console also accessible through the Management Controller at http://localhost:8085
#   - Database initialization with schema and mock data
#   - Automatic cleanup on script termination
# 
# The script automatically:
#   - Detects and uses the current minikube profile
#   - Builds Docker images for both controllers before deployment
#   - Sets up all dependencies (cert-manager, Skupper, PostgreSQL)
#   - Initializes the database with the required schema
#   - Configures port forwarding for local development
#   - Provides comprehensive status checking and error handling
#
# Usage:
#   ./start-console-dev
#
# Environment Variables:
#   NAMESPACE                   - Kubernetes namespace (default: skupper-x-dev)
#   DEV_FRONTEND_PORT          - Frontend development server port (default: 3000)
#   DEV_BACKEND_PORT           - Backend API port for port forwarding (default: 8085)
#   POSTGRES_DB                - PostgreSQL database name (default: studiodb)
#   POSTGRES_USER              - PostgreSQL username (default: access)
#   POSTGRES_PASSWORD          - PostgreSQL password (default: password)
#   MANAGEMENT_CONTROLLER_IMAGE - Management controller Docker image (default: management-controller:latest)
#   SITE_CONTROLLER_IMAGE      - Site controller Docker image (default: site-controller:latest)
#   CERT_MANAGER_VERSION       - cert-manager version to install (default: v1.13.0)
#   SKUPPER_INSTALL_URL        - Skupper v2 installation URL (default: https://skupper.io/v2/install.yaml)
#   NODE_ENV                   - Node environment (default: development)
#   BUILD_PARALLEL             - Build components in parallel (default: true)

set -euo pipefail

# Get the absolute path to the project root directory
# This script should be run from the scripts directory within the project
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Path configuration (relative to PROJECT_ROOT) - Must be defined before verification
COMPONENTS_DIR="${COMPONENTS_DIR:-components}"
MANAGEMENT_CONTROLLER_SUBDIR="${MANAGEMENT_CONTROLLER_SUBDIR:-management-controller}"
SITE_CONTROLLER_SUBDIR="${SITE_CONTROLLER_SUBDIR:-site-controller}"
CONSOLE_SUBDIR="${CONSOLE_SUBDIR:-console}"
YAML_DIR="${YAML_DIR:-yaml}"
SCRIPTS_DIR="${SCRIPTS_DIR:-scripts}"
DB_SETUP_FILE="${DB_SETUP_FILE:-db-setup.sql}"

# PostgreSQL YAML files (relative to YAML_DIR)
POSTGRES_PVC_YAML="${POSTGRES_PVC_YAML:-postgres-pvc-pv.yaml}"
POSTGRES_CONFIG_YAML="${POSTGRES_CONFIG_YAML:-postgres-config.yaml}"
POSTGRES_SERVICE_YAML="${POSTGRES_SERVICE_YAML:-postgres-service.yaml}"
POSTGRES_DEPLOYMENT_YAML="${POSTGRES_DEPLOYMENT_YAML:-postgres-deployment.yaml}"

# Get the script filename dynamically
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

# Verify we're in the right project structure
if [[ ! -f "${PROJECT_ROOT}/${SCRIPTS_DIR}/${SCRIPT_NAME}" ]] || [[ ! -d "${PROJECT_ROOT}/${COMPONENTS_DIR}" ]]; then
    echo "Error: This script must be run from within the skupper-X project structure"
    echo "Current detected project root: ${PROJECT_ROOT}"
    echo "Please run this script from the scripts directory or ensure you're in the correct project"
    exit 1
fi

# Configuration - All values can be overridden with environment variables
NAMESPACE="${NAMESPACE:-skupper-x-dev}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-skupper-postgres-dev}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-studiodb}"
POSTGRES_USER="${POSTGRES_USER:-access}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-password}"

# Development server configuration
DEV_FRONTEND_HOST="${DEV_FRONTEND_HOST:-localhost}"
DEV_FRONTEND_PORT="${DEV_FRONTEND_PORT:-3000}"
DEV_BACKEND_HOST="${DEV_BACKEND_HOST:-localhost}"
DEV_BACKEND_PORT="${DEV_BACKEND_PORT:-8085}"
DEV_BACKEND_URL="http://${DEV_BACKEND_HOST}:${DEV_BACKEND_PORT}"
DEV_FRONTEND_URL="http://${DEV_FRONTEND_HOST}:${DEV_FRONTEND_PORT}"

# Service ports configuration
MANAGEMENT_CONTROLLER_PORT="${MANAGEMENT_CONTROLLER_PORT:-8085}"
SITE_CONTROLLER_PORT="${SITE_CONTROLLER_PORT:-1040}"
ROUTER_HEALTH_PORT="${ROUTER_HEALTH_PORT:-9090}"
ROUTER_AMQP_PORT="${ROUTER_AMQP_PORT:-5672}"

# Container image configuration
MANAGEMENT_CONTROLLER_IMAGE_TAG="${MANAGEMENT_CONTROLLER_IMAGE_TAG:-latest}"
SITE_CONTROLLER_IMAGE_TAG="${SITE_CONTROLLER_IMAGE_TAG:-latest}"
MANAGEMENT_CONTROLLER_IMAGE="${MANAGEMENT_CONTROLLER_IMAGE:-management-controller:${MANAGEMENT_CONTROLLER_IMAGE_TAG}}"
SITE_CONTROLLER_IMAGE="${SITE_CONTROLLER_IMAGE:-site-controller:${SITE_CONTROLLER_IMAGE_TAG}}"
SKUPPER_ROUTER_IMAGE="${SKUPPER_ROUTER_IMAGE:-quay.io/skupper/skupper-router:2.6.0}"

# cert-manager configuration
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.13.0}"
CERT_MANAGER_URL="https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"

# Skupper configuration
SKUPPER_INSTALL_URL="${SKUPPER_INSTALL_URL:-https://skupper.io/v2/install.yaml}"
SKUPPER_SITE_ID="${SKUPPER_SITE_ID:-}"  # Will be auto-generated if empty

# Kubernetes resource names (can be customized)
MANAGEMENT_CONTROLLER_SERVICE_NAME="${MANAGEMENT_CONTROLLER_SERVICE_NAME:-skupperx-admin-api}"
SITE_CONTROLLER_SERVICE_NAME="${SITE_CONTROLLER_SERVICE_NAME:-skupperx-site-api}"
POSTGRES_SERVICE_NAME="${POSTGRES_SERVICE_NAME:-postgres}"

# Development and build configuration
NODE_ENV="${NODE_ENV:-development}"
BUILD_PARALLEL="${BUILD_PARALLEL:-true}"  # Whether to build components in parallel

# Docker configuration
MANAGEMENT_CONTROLLER_DOCKERFILE="${MANAGEMENT_CONTROLLER_DOCKERFILE:-Containerfile}"
SITE_CONTROLLER_DOCKERFILE="${SITE_CONTROLLER_DOCKERFILE:-Containerfile}"
MANAGEMENT_CONTROLLER_IMAGE_TAG="${MANAGEMENT_CONTROLLER_IMAGE_TAG:-latest}"
SITE_CONTROLLER_IMAGE_TAG="${SITE_CONTROLLER_IMAGE_TAG:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function for graceful shutdown
cleanup_dev_environment() {
    log_info "Shutting down development environment..."
    
    # Kill port forwarding processes
    pkill -f "kubectl.*port-forward.*${MANAGEMENT_CONTROLLER_SERVICE_NAME}" || true
    
    # Give processes time to terminate
    sleep 1
    
    log_info "Development environment cleanup completed"
}

# Get the current minikube profile
get_minikube_profile() {
    local profile=$(minikube profile 2>/dev/null || echo "minikube")
    # Remove any leading asterisk and spaces (happens when multiple profiles exist)
    echo "$profile" | sed 's/^[* ]*//g'
}

# Setup signal handlers
trap cleanup_dev_environment EXIT INT TERM

# ==============================================================================
# SIMPLE MINIKUBE CHECK
# ==============================================================================

# Simple check if minikube is running - exit if not
check_minikube_running() {
    log_info "Checking if minikube is running..."
    
    # Check if any minikube profile is running
    if ! minikube status &>/dev/null; then
        log_error "❌ Minikube is not running!"
        log_error ""
        log_error "Please start minikube first:"
        log_error "  minikube start --cpus=4 --memory=8g --driver=docker"
        log_error ""
        log_error "Or start with a specific profile:"
        log_error "  minikube start -p my-profile --cpus=4 --memory=8g --driver=docker"
        log_error ""
        log_error "Then run this script again."
        exit 1
    fi
    
    # Get the current active profile
    local ACTIVE_PROFILE=$(minikube profile 2>/dev/null || echo "minikube")
    log_info "✅ Minikube is running with profile: ${ACTIVE_PROFILE}"
    
    # Verify kubectl can connect to the cluster
    if ! kubectl cluster-info &>/dev/null; then
        log_error "❌ kubectl cannot connect to the minikube cluster"
        log_error "Please check your kubectl configuration"
        exit 1
    fi
    
    log_info "✅ kubectl can connect to the cluster"
    
    # Create namespace if it doesn't exist
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f - &>/dev/null || true
    kubectl config set-context --current --namespace=${NAMESPACE}
    
    # Wait for minikube to be ready
    log_info "Waiting for minikube to be ready..."
    kubectl wait --for=condition=ready pod -l k8s-app=kube-dns -n kube-system --timeout=300s &>/dev/null || true
    
    log_info "✅ Minikube cluster is ready, using namespace: ${NAMESPACE}"
    
    log_info "Using minikube profile: $(get_minikube_profile)"
    log_info "Using namespace: ${NAMESPACE}"
}

# ==============================================================================

# DEPENDENCY AND SETUP FUNCTIONS
# ==============================================================================

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    local missing_deps=()
    
    # Check for required tools
    for cmd in minikube kubectl docker yarn; do
        if ! command -v $cmd &> /dev/null; then
            missing_deps+=($cmd)
        fi
    done
    
    # Check Node.js and npm
    if ! command -v node &> /dev/null; then
        missing_deps+=("node")
    fi
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install the missing tools and try again"
        log_error "For yarn: npm install -g yarn"
        exit 1
    fi
    
    log_info "All dependencies found"
}



# Install cert-manager
install_cert_manager() {
    log_info "Installing cert-manager..."
    
    if kubectl get namespace cert-manager >/dev/null 2>&1; then
        log_info "cert-manager namespace already exists, checking installation..."
        if kubectl get deployment cert-manager -n cert-manager >/dev/null 2>&1; then
            log_info "cert-manager is already installed"
            setup_cert_manager_root
            return 0
        fi
    fi
    
    kubectl apply -f "${CERT_MANAGER_URL}"
    
    log_info "Waiting for cert-manager namespace to become active..."
    kubectl wait --for=condition=Active namespace/cert-manager --timeout=60s
    
    log_info "Waiting for cert-manager deployments to be ready..."
    kubectl wait --for=condition=available deployment/cert-manager -n cert-manager --timeout=300s
    kubectl wait --for=condition=available deployment/cert-manager-cainjector -n cert-manager --timeout=300s
    
    log_info "Waiting for cert-manager webhook..."
    for i in {1..60}; do
        if kubectl get deployment cert-manager-webhook -n cert-manager >/dev/null 2>&1; then
            local ready=$(kubectl get deployment cert-manager-webhook -n cert-manager -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
            if [ "$ready" -gt 0 ]; then
                log_info "cert-manager webhook is ready"
                break
            fi
        fi
        
        if [ $i -eq 60 ]; then
            log_warn "cert-manager webhook taking longer than expected, but proceeding..."
            break
        fi
        sleep 2
    done
    
    setup_cert_manager_root
}

# Install Skupper CRDs and controller
install_skupper() {
    log_info "Installing Skupper v2 CRDs and controller..."
    
    # Check if Skupper CRDs are already installed
    if kubectl get crd sites.skupper.io >/dev/null 2>&1; then
        log_info "Skupper CRDs already installed, checking controller..."
        if kubectl get deployment skupper-site-controller -n skupper-system >/dev/null 2>&1; then
            log_info "Skupper controller is already running"
            return 0
        fi
    fi
    
    # Install Skupper v2 with CRDs and controller
    kubectl apply -f "${SKUPPER_INSTALL_URL}"
    
    # Wait for skupper-system namespace to be created
    log_info "Waiting for skupper-system namespace..."
    kubectl wait --for=condition=Active namespace/skupper-system --timeout=60s || {
        log_warn "skupper-system namespace not found, but continuing..."
    }
    
    # Wait for CRDs to be established
    log_info "Waiting for Skupper CRDs to be established..."
    for crd in sites.skupper.io links.skupper.io listeners.skupper.io connectors.skupper.io; do
        if kubectl get crd $crd >/dev/null 2>&1; then
            kubectl wait --for=condition=established crd/$crd --timeout=120s || {
                log_warn "CRD $crd taking longer than expected, but continuing..."
            }
        fi
    done
    
    # Wait for controller to be ready (if it was installed)
    if kubectl get deployment skupper-site-controller -n skupper-system >/dev/null 2>&1; then
        log_info "Waiting for Skupper controller to be ready..."
        kubectl wait --for=condition=available deployment/skupper-site-controller -n skupper-system --timeout=300s || {
            log_warn "Skupper controller taking longer than expected, but continuing..."
        }
    else
        log_info "Skupper controller not found in installation, continuing with CRDs only..."
    fi
    
    log_info "Skupper installation completed"
}

# Setup cert-manager root CA
setup_cert_manager_root() {
    log_info "Setting up cert-manager root CA..."
    
    for attempt in {1..5}; do
        if kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-cluster-issuer
spec:
  selfSigned: {}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: skupperx-root-ca
  namespace: ${NAMESPACE}
spec:
  isCA: true
  commonName: skupperx-root-ca
  secretName: skupperx-root-ca-secret
  issuerRef:
    name: selfsigned-cluster-issuer
    kind: ClusterIssuer
    group: cert-manager.io
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: skupperx-root
  namespace: ${NAMESPACE}
spec:
  ca:
    secretName: skupperx-root-ca-secret
EOF
        then
            log_info "Resources applied successfully on attempt ${attempt}"
            break
        else
            log_warn "Failed to apply resources on attempt ${attempt}"
            if [ $attempt -eq 5 ]; then
                log_error "Failed to create cert-manager resources after 5 attempts"
                return 1
            fi
            sleep 10
        fi
    done
    
    log_info "Waiting for ClusterIssuer and Certificate..."
    for i in {1..60}; do
        if kubectl get clusterissuer selfsigned-cluster-issuer >/dev/null 2>&1 && kubectl get secret skupperx-root-ca-secret -n ${NAMESPACE} >/dev/null 2>&1; then
            log_info "Cert-manager setup completed successfully"
            break
        fi
        if [ $i -eq 60 ]; then
            log_error "Cert-manager setup failed"
            return 1
        fi
        sleep 2
    done
}

# Setup PostgreSQL
setup_postgresql() {
    log_info "Setting up PostgreSQL..."
    
    # Check if already running
    if kubectl get deployment postgres -n ${NAMESPACE} >/dev/null 2>&1; then
        log_info "PostgreSQL is already deployed"
        return 0
    fi
    
    # Get the project root directory
    # Using the global PROJECT_ROOT variable set at the top of the script
    
    # Apply existing PostgreSQL configuration
    kubectl apply -f "${PROJECT_ROOT}/${YAML_DIR}/${POSTGRES_PVC_YAML}" -n ${NAMESPACE} || true
    kubectl apply -f "${PROJECT_ROOT}/${YAML_DIR}/${POSTGRES_CONFIG_YAML}" -n ${NAMESPACE}
    kubectl apply -f "${PROJECT_ROOT}/${YAML_DIR}/${POSTGRES_SERVICE_YAML}" -n ${NAMESPACE}
    kubectl apply -f "${PROJECT_ROOT}/${YAML_DIR}/${POSTGRES_DEPLOYMENT_YAML}" -n ${NAMESPACE}
    
    log_info "Waiting for PostgreSQL to be ready..."
    kubectl wait --for=condition=available deployment/postgres -n ${NAMESPACE} --timeout=300s
}

# Initialize database
init_database() {
    log_info "Initializing database..."
    
    local POSTGRES_POD=$(kubectl get pod -l app=postgres -n ${NAMESPACE} -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "$POSTGRES_POD" ]; then
        log_error "PostgreSQL pod not found"
        return 1
    fi
    
    # Wait for PostgreSQL to be ready
    log_info "Waiting for PostgreSQL to accept connections..."
    for i in {1..30}; do
        if kubectl exec -i ${POSTGRES_POD} -n ${NAMESPACE} -- env PGPASSWORD=${POSTGRES_PASSWORD} psql -h 127.0.0.1 -U ${POSTGRES_USER} -d ${POSTGRES_DB} -p 5432 -c "SELECT 1;" >/dev/null 2>&1; then
            log_info "PostgreSQL is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "PostgreSQL failed to become ready"
            return 1
        fi
        sleep 2
    done
    
    # Check if database is already initialized
    if kubectl exec -i ${POSTGRES_POD} -n ${NAMESPACE} -- env PGPASSWORD=${POSTGRES_PASSWORD} psql -h 127.0.0.1 -U ${POSTGRES_USER} -d ${POSTGRES_DB} -p 5432 -c "SELECT 1 FROM users LIMIT 1;" >/dev/null 2>&1; then
        log_info "Database is already initialized"
        return 0
    fi
    
    log_info "Running database schema setup..."
    # Using the global PROJECT_ROOT variable set at the top of the script
    if [ -f "${PROJECT_ROOT}/${SCRIPTS_DIR}/${DB_SETUP_FILE}" ]; then
        kubectl exec -i ${POSTGRES_POD} -n ${NAMESPACE} -- env PGPASSWORD=${POSTGRES_PASSWORD} psql -h 127.0.0.1 -U ${POSTGRES_USER} -d ${POSTGRES_DB} -p 5432 < "${PROJECT_ROOT}/${SCRIPTS_DIR}/${DB_SETUP_FILE}" 2>&1 | grep -v "already exists" | grep -v "duplicate key value violates unique constraint" | grep "ERROR:" && [ ${PIPESTATUS[0]} -ne 0 ] || true
        log_info "Database schema initialized successfully"
    else
        log_warn "Database setup file not found, skipping schema initialization"
    fi
}

# Deploy management controller
deploy_management_controller() {
    log_info "Deploying management controller..."
    
    # Build the Docker image for management controller
    build_management_controller_image || {
        log_error "Failed to build management controller Docker image"
        return 1
    }
    
    # Generate and apply management controller YAML inline
    log_info "Creating management controller resources..."
    kubectl apply -f - <<EOF
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: skupperx-management-controller
  namespace: ${NAMESPACE}
  labels:
    application: skupperx
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: skupperx-management-controller
  namespace: ${NAMESPACE}
  labels:
    application: skupperx
rules:
- apiGroups:
  - ""
  resources:
  - secrets
  verbs:
  - get
  - list
  - watch
  - create
  - update
  - delete
  - patch
- apiGroups:
  - cert-manager.io
  resources:
  - issuers
  - certificates
  verbs:
  - get
  - list
  - watch
  - create
  - update
  - delete
  - patch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    application: skupperx
  name: skupperx-management-controller
  namespace: ${NAMESPACE}
subjects:
- kind: ServiceAccount
  name: skupperx-management-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: skupperx-management-controller
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: skupperx-management-controller
  namespace: ${NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: skupperx-management-controller
  template:
    metadata:
      labels:
        app: skupperx-management-controller
    spec:
      serviceAccount: skupperx-management-controller
      serviceAccountName: skupperx-management-controller
      containers:
        - name: skupperx-management-controller
          image: ${MANAGEMENT_CONTROLLER_IMAGE}
          imagePullPolicy: Never
          ports:
            - containerPort: ${MANAGEMENT_CONTROLLER_PORT}
          env:
            - name: PGHOST
              value: ${POSTGRES_SERVICE_NAME}
            - name: PGUSER
              value: ${POSTGRES_USER}
            - name: PGPASSWORD
              value: ${POSTGRES_PASSWORD}
            - name: PGDATABASE
              value: ${POSTGRES_DB}
            - name: SKX_CONTROLLER_NAME
              value: main-controller
---
apiVersion: v1
kind: Service
metadata:
  name: ${MANAGEMENT_CONTROLLER_SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  type: ClusterIP
  internalTrafficPolicy: Cluster
  ports:
  - name: adminapi
    port: ${MANAGEMENT_CONTROLLER_PORT}
    protocol: TCP
    targetPort: ${MANAGEMENT_CONTROLLER_PORT}
  selector:
    app: skupperx-management-controller
EOF

    log_info "Waiting for management controller to be ready..."
    kubectl wait --for=condition=available deployment/skupperx-management-controller -n ${NAMESPACE} --timeout=300s
}

# Generate and apply site controller components
deploy_site_controller() {
    log_info "Deploying site controller with router sidecar..."
    
    # Build the Docker image for site controller
    build_site_controller_image || {
        log_error "Failed to build site controller Docker image"
        return 1
    }
    
    # Generate and apply RBAC
    log_info "Creating site controller RBAC..."
    kubectl apply -f - <<EOF
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: skupperx-site
  namespace: ${NAMESPACE}
  labels:
    application: skupperx
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: skupperx-site
  namespace: ${NAMESPACE}
  labels:
    application: skupperx
rules:
- apiGroups: [""]
  resources: ["configmaps", "pods", "pods/exec", "services", "secrets", "serviceaccounts", "events"]
  verbs: ["get", "list", "watch", "create", "update", "delete", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list", "watch", "create", "update", "delete"]
- apiGroups: ["route.openshift.io"]
  resources: ["routes"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses", "networkpolicies"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["projectcontour.io"]
  resources: ["httpproxies"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: ["rolebindings", "roles"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["apps.openshift.io"]
  resources: ["deploymentconfigs"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["skupper.io"]
  resources: ["sites", "links", "listeners", "connectors", "accessgrants", "accesstokens", "attachedconnectors", "attachedconnectorbindings", "certificates", "routeraccesses", "securedaccesses"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    application: skupperx
  name: skupperx-site
  namespace: ${NAMESPACE}
subjects:
- kind: ServiceAccount
  name: skupperx-site
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: skupperx-site
EOF

    # Generate and apply router configuration
    log_info "Creating router configuration..."
    kubectl apply -f - <<EOF
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: skupper-internal
  namespace: ${NAMESPACE}
data:
  skrouterd.json: |-
    [
        [
            "router",
            {
                "id": "skx-backbone-site",
                "mode": "interior",
                "helloMaxAgeSeconds": "3",
                "metadata": "{\"version\":\"1.4.3\",\"platform\":\"kubernetes\"}"
            }
        ],
        [
            "listener",
            {
                "name": "health",
                "role": "normal",
                "port": ${ROUTER_HEALTH_PORT},
                "http": true,
                "httpRootDir": "disabled",
                "healthz": true,
                "metrics": true
            }
        ],
        [
            "listener",
            {
                "name": "sidecar",
                "host": "localhost",
                "port": ${ROUTER_AMQP_PORT}
            }
        ],
        [
            "address",
            {
                "prefix": "mc",
                "distribution": "multicast"
            }
        ],
        [
            "log",
            {
                "module": "ROUTER_CORE",
                "enable": "error+"
            }
        ]
    ]
EOF

    # Generate unique site ID
    local SITE_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
    
    # Generate and apply complete site deployment with router sidecar
    log_info "Creating site controller deployment with site ID: ${SITE_ID}"
    kubectl apply -f - <<EOF
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app.kubernetes.io/name: skupperx-site
    app.kubernetes.io/part-of: skupperx
    skupper.io/component: router
    application: skupperx
  name: skupperx-site
  namespace: ${NAMESPACE}
spec:
  progressDeadlineSeconds: 600
  replicas: 1
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      skupper.io/component: router
  strategy:
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
    type: RollingUpdate
  template:
    metadata:
      annotations:
        prometheus.io/port: "${ROUTER_HEALTH_PORT}"
        prometheus.io/scrape: "true"
      labels:
        app.kubernetes.io/name: skupperx-site
        app.kubernetes.io/part-of: skupperx
        application: skx-router
        skupper.io/component: router
    spec:
      containers:
      - env:
        - name: APPLICATION_NAME
          value: skupperx
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.namespace
        - name: POD_IP
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: status.podIP
        - name: QDROUTERD_AUTO_MESH_DISCOVERY
          value: QUERY
        - name: QDROUTERD_CONF
          value: /etc/skupper-router/config/skrouterd.json
        - name: QDROUTERD_CONF_TYPE
          value: json
        image: ${SKUPPER_ROUTER_IMAGE}
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: ${ROUTER_HEALTH_PORT}
            scheme: HTTP
          initialDelaySeconds: 60
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        name: router
        ports:
        - containerPort: ${ROUTER_HEALTH_PORT}
          name: http
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: ${ROUTER_HEALTH_PORT}
            scheme: HTTP
          initialDelaySeconds: 1
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources: {}
        securityContext:
          runAsNonRoot: true
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/skupper-router/config/
          name: router-config
        - mountPath: /etc/skupper-router-certs
          name: skupper-router-certs
      - image: ${SITE_CONTROLLER_IMAGE}
        imagePullPolicy: Never
        name: controller
        env:
        - name: SKUPPERX_SITE_ID
          value: "${SITE_ID}"
        - name: SKX_BACKBONE
          value: "YES"
        - name: NODE_ENV
          value: production
        ports:
        - containerPort: ${SITE_CONTROLLER_PORT}
          name: siteapi
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: ${SITE_CONTROLLER_PORT}
            scheme: HTTP
          initialDelaySeconds: 1
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources: {}
        securityContext:
          runAsNonRoot: true
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/skupper-router-certs
          name: skupper-router-certs
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        runAsNonRoot: true
      serviceAccount: skupperx-site
      serviceAccountName: skupperx-site
      terminationGracePeriodSeconds: 30
      volumes:
      - configMap:
          defaultMode: 420
          name: skupper-internal
        name: router-config
      - emptyDir: {}
        name: skupper-router-certs
---
apiVersion: v1
kind: Service
metadata:
  name: ${SITE_CONTROLLER_SERVICE_NAME}
  namespace: ${NAMESPACE}
spec:
  selector:
    skupper.io/component: router
  ports:
  - port: ${SITE_CONTROLLER_PORT}
    targetPort: ${SITE_CONTROLLER_PORT}
    name: siteapi
  type: ClusterIP
EOF

    log_info "Waiting for site controller to be ready..."
    # Use a more lenient timeout and check what's happening
    if ! kubectl wait --for=condition=available deployment/skupperx-site -n ${NAMESPACE} --timeout=60s; then
        log_warn "Site controller deployment taking longer than expected, checking status..."
        kubectl get pods -l skupper.io/component=router -n ${NAMESPACE} -o wide || true
        kubectl describe deployment skupperx-site -n ${NAMESPACE} || true
        
        # Get pod logs if pods exist
        local SITE_POD=$(kubectl get pod -l skupper.io/component=router -n ${NAMESPACE} -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
        if [ -n "$SITE_POD" ]; then
            log_info "Getting logs from site controller pod..."
            echo "Router container logs:"
            kubectl logs ${SITE_POD} -c router -n ${NAMESPACE} --tail=20 || true
            echo ""
            echo "Controller container logs:"
            kubectl logs ${SITE_POD} -c controller -n ${NAMESPACE} --tail=20 || true
        fi
        
        log_warn "Site controller may have issues, but continuing to check status..."
    else
        log_info "Site controller deployed successfully"
    fi
}

# Check deployment status
check_deployment_status() {
    log_info "Checking deployment status..."
    
    log_info "=== Pod Status ==="
    kubectl get pods -n ${NAMESPACE} -o wide
    
    log_info "=== Service Status ==="
    kubectl get services -n ${NAMESPACE}
    
    log_info "=== Deployment Status ==="
    kubectl get deployments -n ${NAMESPACE}
    
    # Check if site controller AMQP is working
    log_info "=== Site Controller Logs (last 10 lines) ==="
    local SITE_POD=$(kubectl get pod -l skupper.io/component=router -n ${NAMESPACE} -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    if [ -n "$SITE_POD" ]; then
        echo "Router container logs:"
        kubectl logs ${SITE_POD} -c router -n ${NAMESPACE} --tail=5 || true
        echo ""
        echo "Controller container logs:"
        kubectl logs ${SITE_POD} -c controller -n ${NAMESPACE} --tail=10 || true
    else
        log_warn "Site controller pod not found"
    fi
    
    # Setup port forwarding for local development
    log_info "Setting up port forwarding for API access..."
    
    # Kill any existing port forwarding
    pkill -f "kubectl.*port-forward.*${MANAGEMENT_CONTROLLER_SERVICE_NAME}" || true
    
    # Start port forwarding in background
    kubectl port-forward service/${MANAGEMENT_CONTROLLER_SERVICE_NAME} ${DEV_BACKEND_PORT}:${MANAGEMENT_CONTROLLER_PORT} -n ${NAMESPACE} &
    local PORT_FORWARD_PID=$!
    
    # Wait a moment for port forwarding to establish
    sleep 2
    
    # Verify port forwarding is working
    if ! kill -0 $PORT_FORWARD_PID 2>/dev/null; then
        log_error "Port forwarding failed to start"
        return 1
    fi
    
    log_info "Port forwarding established: ${DEV_BACKEND_HOST}:${DEV_BACKEND_PORT} -> ${MANAGEMENT_CONTROLLER_SERVICE_NAME}:${MANAGEMENT_CONTROLLER_PORT}"
}

# Simple Docker setup - just check if Docker is available
setup_docker_env() {
    log_info "Setting up Docker environment to use minikube's Docker daemon..."
    
    # Verify Docker is available
    if ! docker version >/dev/null 2>&1; then
        log_error "Docker is not available or not running"
        return 1
    fi
    
    # Configure Docker to use minikube's Docker daemon
    log_info "Configuring Docker to use minikube's Docker daemon..."
    eval $(minikube docker-env -p $(get_minikube_profile)) || {
        log_error "Failed to configure Docker environment for minikube"
        return 1
    }
    
    # Verify the configuration worked
    if ! docker version >/dev/null 2>&1; then
        log_error "Docker not accessible after configuring minikube environment"
        return 1
    fi
    
    log_info "Docker environment configured successfully for minikube"
}

# Build Docker image for management controller
build_management_controller_image() {
    log_info "Building management controller Docker image..."
    
    # First build the application (includes console build and creates app directory)
    build_management_controller || {
        log_error "Failed to build management controller application"
        return 1
    }
    
    # Using the global PROJECT_ROOT variable set at the top of the script
    local MC_DIR="${PROJECT_ROOT}/${COMPONENTS_DIR}/${MANAGEMENT_CONTROLLER_SUBDIR}"
    
    cd "$MC_DIR"
    
    # Build the Docker image using Minikube's Docker daemon
    log_info "Building management-controller:${MANAGEMENT_CONTROLLER_IMAGE_TAG} image..."
    docker build -f ${MANAGEMENT_CONTROLLER_DOCKERFILE} -t management-controller:${MANAGEMENT_CONTROLLER_IMAGE_TAG} . || {
        log_error "Failed to build management controller Docker image"
        return 1
    }
    
    # Verify the image was built
    if ! docker images management-controller:${MANAGEMENT_CONTROLLER_IMAGE_TAG} | grep -q ${MANAGEMENT_CONTROLLER_IMAGE_TAG}; then
        log_error "Management controller image not found after build"
        return 1
    fi
    
    log_info "Management controller Docker image built successfully"
    cd "${PROJECT_ROOT}"
}

# Build Docker image for site controller
build_site_controller_image() {
    log_info "Building site controller Docker image..."
    
    # First build the application (creates app directory)
    build_site_controller || {
        log_error "Failed to build site controller application"
        return 1
    }
    
    # Using the global PROJECT_ROOT variable set at the top of the script
    local SC_DIR="${PROJECT_ROOT}/${COMPONENTS_DIR}/${SITE_CONTROLLER_SUBDIR}"
    
    cd "$SC_DIR"
    
    # Build the Docker image using Minikube's Docker daemon
    log_info "Building site-controller:${SITE_CONTROLLER_IMAGE_TAG} image..."
    docker build -f ${SITE_CONTROLLER_DOCKERFILE} -t site-controller:${SITE_CONTROLLER_IMAGE_TAG} . || {
        log_error "Failed to build site controller Docker image"
        return 1
    }
    
    # Verify the image was built
    if ! docker images site-controller:${SITE_CONTROLLER_IMAGE_TAG} | grep -q ${SITE_CONTROLLER_IMAGE_TAG}; then
        log_error "Site controller image not found after build"
        return 1
    fi
    
    log_info "Site controller Docker image built successfully"
    cd "${PROJECT_ROOT}"
}

# Build management controller (includes console build)
build_management_controller() {
    log_info "Building management controller (includes console build)..."
    
    # Get the absolute path to the project directories - using global PROJECT_ROOT
    local MC_DIR="${PROJECT_ROOT}/${COMPONENTS_DIR}/${MANAGEMENT_CONTROLLER_SUBDIR}"
    local CONSOLE_DIR="${PROJECT_ROOT}/${COMPONENTS_DIR}/${CONSOLE_SUBDIR}"
    
    # Check if directories exist
    if [ ! -d "$MC_DIR" ]; then
        log_error "Management controller directory not found at: $MC_DIR"
        return 1
    fi
    
    if [ ! -d "$CONSOLE_DIR" ]; then
        log_error "Console directory not found at: $CONSOLE_DIR"
        return 1
    fi
    
    # Install console dependencies first
    cd "$CONSOLE_DIR"
    if [ ! -d "node_modules" ]; then
        log_info "Installing console dependencies..."
        yarn install || { log_error "Failed to install console dependencies"; return 1; }
    else
        log_info "Console dependencies already installed"
    fi
    
    # Install management controller dependencies
    cd "$MC_DIR"
    if [ ! -d "node_modules" ]; then
        log_info "Installing management controller dependencies..."
        npm install || { log_error "Failed to install management controller dependencies"; return 1; }
    else
        log_info "Management controller dependencies already installed"
    fi
    
    # Run the build script (console + server)
    log_info "Running build script (console + server)..."
    node build.js || { log_error "Failed to build management controller"; return 1; }
    
    log_info "Management controller build completed successfully"
    cd "${PROJECT_ROOT}"
}

# Build site controller
build_site_controller() {
    log_info "Building site controller..."
    
    # Using the global PROJECT_ROOT variable set at the top of the script
    local SC_DIR="${PROJECT_ROOT}/${COMPONENTS_DIR}/${SITE_CONTROLLER_SUBDIR}"
    
    # Check if directory exists
    if [ ! -d "$SC_DIR" ]; then
        log_error "Site controller directory not found at: $SC_DIR"
        return 1
    fi
    
    # Install dependencies
    cd "$SC_DIR"
    if [ ! -d "node_modules" ]; then
        log_info "Installing site controller dependencies..."
        npm install || { log_error "Failed to install site controller dependencies"; return 1; }
    else
        log_info "Site controller dependencies already installed"
    fi
    
    # Run the build script
    log_info "Running site controller build script..."
    node build.js || { log_error "Failed to build site controller"; return 1; }
    
    log_info "Site controller build completed successfully"
    cd "${PROJECT_ROOT}"
}

# Build console for development
build_console() {
    log_info "Building console for development..."
    
    # Using the global PROJECT_ROOT variable set at the top of the script
    local CONSOLE_DIR="${PROJECT_ROOT}/${COMPONENTS_DIR}/${CONSOLE_SUBDIR}"
    
    cd "$CONSOLE_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing console dependencies..."
        yarn install || { log_error "Failed to install console dependencies"; return 1; }
    else
        log_info "Console dependencies already installed"
    fi
    
    # Build for development
    log_info "Building console..."
    yarn build || { log_error "Failed to build console"; return 1; }
    
    log_info "Console build completed successfully"
    cd "${PROJECT_ROOT}"
}

# Start frontend development server
start_frontend_dev_server() {
    log_info "Starting frontend development server..."
    
    # Get the absolute path to the console directory - using global PROJECT_ROOT
    local CONSOLE_DIR="$PROJECT_ROOT/${COMPONENTS_DIR}/${CONSOLE_SUBDIR}"
    
    # Check if console directory exists
    if [ ! -d "$CONSOLE_DIR" ]; then
        log_error "Console directory not found at: $CONSOLE_DIR"
        return 1
    fi
    
    # Install dependencies if needed
    cd "$CONSOLE_DIR"
    if [ ! -d "node_modules" ]; then
        log_info "Installing console dependencies for development server..."
        yarn install || { log_error "Failed to install console dependencies"; return 1; }
    else
        log_info "Console dependencies already installed"
    fi
    
    # Get backend URL for API proxy (using local port forwarding)
    BACKEND_URL="${DEV_BACKEND_URL}"
    export BACKEND_URL
    
    log_info "Frontend will proxy API requests to: ${BACKEND_URL}"
    
    # Set environment for development
    export NODE_ENV="${NODE_ENV}"
    
    log_info "Frontend development server starting on ${DEV_FRONTEND_URL}"
    log_info "API requests will be proxied to: ${BACKEND_URL}"
    log_info ""
    log_info "=== Hybrid Development Environment Ready ==="
    log_info "Frontend: ${DEV_FRONTEND_URL} (with hot reload)"
    log_info "Backend API: ${BACKEND_URL} (via port forwarding)"
    log_info "Minikube Profile: $(get_minikube_profile)"
    log_info ""
    log_info "Press Ctrl+C to stop all services"
    log_info ""
    
    # Start development server (webpack will use BACKEND_URL for proxy)
    yarn start
}

# Main execution
main() {
    log_info "Starting Skupper-X development environment with cert support..."
    log_info "Using inline YAML generation without external files"
    log_info "All components will be built and deployed automatically"
    
    check_dependencies
    
    # Check if minikube is running BEFORE building components (user must start it manually)
    check_minikube_running
    
    # Setup Docker environment to use Minikube's Docker daemon
    setup_docker_env || { log_error "Failed to setup Docker environment"; exit 1; }
    
    # Build application components (prepare files for Docker build)
    build_management_controller || { log_error "Failed to build management controller"; exit 1; }
    build_site_controller || { log_error "Failed to build site controller"; exit 1; }
    
    install_cert_manager || { log_error "Failed to install cert-manager"; exit 1; }
    install_skupper || { log_error "Failed to install Skupper"; exit 1; }
    setup_postgresql || { log_error "Failed to setup PostgreSQL"; exit 1; }
    init_database || { log_error "Failed to initialize database"; exit 1; }
    deploy_management_controller || { log_error "Failed to deploy management controller"; exit 1; }
    deploy_site_controller || { log_error "Failed to deploy site controller"; exit 1; }
    
    check_deployment_status
    
    start_frontend_dev_server || { log_error "Failed to start frontend dev server"; exit 1; }
    
    log_info "=== Skupper-X Hybrid Development Environment Ready ==="
    log_info "Backend components deployed in Kubernetes successfully!"
    log_info "Frontend development server starting on ${DEV_FRONTEND_URL}"
    log_info ""
    log_info "Services:"
    local BACKEND_IP=$(minikube ip -p $(get_minikube_profile))
    local MC_PORT=$(kubectl get service ${MANAGEMENT_CONTROLLER_SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
    local SC_PORT=$(kubectl get service ${SITE_CONTROLLER_SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
    
    if [ -n "$MC_PORT" ]; then
        log_info "  🔗 Management Controller API: http://${BACKEND_IP}:${MC_PORT}"
    fi
    if [ -n "$SC_PORT" ]; then
        log_info "  🔗 Site Controller API: http://${BACKEND_IP}:${SC_PORT}"
    fi
    log_info "  🔗 Frontend Console: ${DEV_FRONTEND_URL} (with hot reload)"
    log_info ""
    log_info "Press Ctrl+C to stop all services"
    log_info ""
}

# Cleanup function (optional)
cleanup() {
    log_info "Cleaning up Skupper-X environment..."
    kubectl delete namespace ${NAMESPACE} --ignore-not-found=true
    minikube stop -p $(get_minikube_profile) || true
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ "${1:-}" == "cleanup" ]]; then
        cleanup
    else
        main "$@"
    fi
fi
