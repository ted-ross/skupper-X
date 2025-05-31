# Skupper-X Development Scripts

This directory contains scripts to set up and run Skupper-X in various development and standalone modes.

## Available Scripts

### 🔧 `check-dependencies.sh`
**Dependency management** - Comprehensive check and installation of all project dependencies.

```bash
# Check all dependencies
./scripts/check-dependencies.sh

# Check with security audit
./scripts/check-dependencies.sh --security

# Force reinstall all dependencies
./scripts/check-dependencies.sh --force

# Show help
./scripts/check-dependencies.sh --help
```

**What it does:**
- Verifies system dependencies (Node.js, npm, yarn, Docker, curl)
- Checks and installs/updates npm/yarn dependencies for all components
- Validates dependency versions and compatibility
- Optional security vulnerability scanning
- Smart dependency caching (only updates when needed)

**Best for:** Initial setup, troubleshooting dependency issues

---

### 🚀 `start-dev-mode.sh`
**Complete development environment** - Starts both backend and frontend with hot reload.

```bash
./scripts/start-dev-mode.sh
```

**What it does:**
- Sets up PostgreSQL database (Docker)
- Starts backend in background
- Starts frontend with hot reload in foreground
- Configures proxy for API calls
- Provides cleanup on Ctrl+C

**Best for:** Active development with immediate feedback

---

### 🖥️ `start-skupper-standalone.sh`
**Backend-only standalone mode** - Runs complete Skupper-X backend with integrated web console.

```bash
./scripts/start-skupper-standalone.sh
```

**What it does:**
- Sets up PostgreSQL database (Docker)
- Builds and integrates web console
- Starts management controller with built console
- Single process serving both API and UI

**Best for:** Testing, demos, production-like setup

---

### 🎨 `start-console-dev.sh`
**Frontend-only development** - Starts just the React development server.

```bash
./scripts/start-console-dev.sh
```

**Prerequisites:** Backend must be running (port 8085)

**What it does:**
- Checks if backend is responding
- Starts React dev server with hot reload
- Proxies API calls to backend

**Best for:** Frontend-only development

---

### 🗄️ `start-database.sh`
**Database management** - Comprehensive PostgreSQL setup and management.

```bash
# Setup database
./scripts/start-database.sh setup

# Check status
./scripts/start-database.sh status

# Start existing database
./scripts/start-database.sh start

# Stop database
./scripts/start-database.sh stop

# View logs
./scripts/start-database.sh logs

# Connect to database
./scripts/start-database.sh connect

# Remove database
./scripts/start-database.sh remove
```

**Best for:** Database-only operations, troubleshooting

## Development Workflows

### 🔄 Full Development Cycle
For active development with both frontend and backend changes:

```bash
# Start complete development environment
./scripts/start-dev-mode.sh

# Services available:
# - Frontend: http://localhost:3000 (with hot reload)
# - Backend:  http://localhost:8085
# - Database: localhost:5432

# Press Ctrl+C to stop all services
```

### 🎯 Frontend-Only Development
When working only on React components:

```bash
# Terminal 1: Start backend
./scripts/start-skupper-standalone.sh

# Terminal 2: Start frontend dev server
./scripts/start-console-dev.sh
```

### 🔧 Backend-Only Development
When working on API or business logic:

```bash
# Setup database once
./scripts/start-database.sh setup

# Start backend with built console
./scripts/start-skupper-standalone.sh
```

### 🚢 Production-Like Testing
To test the complete integrated system:

```bash
# This mimics production deployment
./scripts/start-skupper-standalone.sh

# Access at: http://localhost:8085
```

## Environment Variables

All scripts automatically set these variables for standalone mode:

- `SKX_STANDALONE_NAMESPACE="skupper-system"`
- `POSTGRES_HOST="localhost"`
- `POSTGRES_PORT="5432"`
- `POSTGRES_DB="studiodb"`
- `POSTGRES_USER="access"`
- `POSTGRES_PASSWORD="password"`

## Database Configuration

PostgreSQL runs in Docker with these settings:
- **Container name:** `skupper-postgres`
- **Port:** 5432
- **Database:** studiodb
- **User:** access
- **Password:** password
- **Persistent volume:** `skupper-postgres-data`

## Ports Used

| Service | Port | Description |
|---------|------|-------------|
| Backend API | 8085 | Management controller REST API |
| Frontend Dev | 3000 | React development server |
| PostgreSQL | 5432 | Database server |

## Troubleshooting

### Backend won't start
```bash
# Check logs
tail -f /tmp/skupper-backend.log

# Check database
./scripts/start-database.sh status

# Restart database
./scripts/start-database.sh stop
./scripts/start-database.sh start
```

### Frontend can't connect to backend
```bash
# Check if backend is responding
curl http://localhost:8085/healthz

# Check proxy configuration in webpack.dev.js
```

### Database issues
```bash
# Check container status
docker ps | grep skupper-postgres

# View database logs
./scripts/start-database.sh logs

# Connect to database directly
./scripts/start-database.sh connect

# Reset database
./scripts/start-database.sh remove
./scripts/start-database.sh setup
```

### Port conflicts
```bash
# Check what's using ports
lsof -i :8085
lsof -i :3000
lsof -i :5432

# Stop conflicting processes or use different ports
```

## Script Dependencies

All scripts require:
- **Docker** (for PostgreSQL)
- **Node.js** (for backend and frontend)
- **Yarn** (for frontend dependencies)
- **curl** (for health checks)

Install on Ubuntu/Debian:
```bash
sudo apt update
sudo apt install docker.io nodejs yarn curl
```

## Files Created

The scripts create these temporary files:
- `/tmp/skupper-backend.log` - Backend logs
- `/tmp/skupper-backend.pid` - Backend process ID
- Docker volume `skupper-postgres-data` - Database persistence

Clean up with:
```bash
# Remove temporary files
rm -f /tmp/skupper-backend.*

# Remove Docker volume (loses data!)
docker volume rm skupper-postgres-data
```
