# Development Scripts

This folder contains various scripts to help with development, testing, and deployment of the Skupper-X project.

## Quick Start

### Full Development Environment
```bash
./start-dev.sh
```
This launches the complete development stack with hot reload capabilities:
- **PostgreSQL Database**: Docker container with pre-populated mock data
- **Console UI**: http://localhost:3000 (React development server)
- **Prototype UI**: http://localhost:8085 (Backend with static files)

### Console Only (Frontend)
```bash
./start-dev-console-only.sh
```
Starts only the React development server (assumes backend is already running).

**Remote Backend Support:**
```bash
BACKEND_URL=http://remote-server:8085 ./start-dev-console-only.sh
```
Connect to a remote backend by setting the `BACKEND_URL` environment variable.

### Database Only
```bash
./start-dev-database-only.sh
```
Starts only the PostgreSQL database container.

## Available Scripts

### Development Scripts

- **`start-dev.sh`** - Main development script
  - Starts PostgreSQL database in Docker container
  - Loads predefined mock data for development
  - Launches management controller backend (port 8085)
  - Starts React console frontend (port 3000)
  - Enables hot reload for both backend and frontend
  - Use `--skip-package-check` to skip dependency updates

- **`start-dev-console-only.sh`** - Frontend only development
  - Starts React development server with hot reload
  - Proxies API calls to backend at port 8085
  - Supports remote backend via `BACKEND_URL` environment variable
  - Example: `BACKEND_URL=http://remote-server:8085 ./start-dev-console-only.sh`

- **`start-dev-database-only.sh`** - Database only
  - Starts PostgreSQL container in Docker
  - Initializes database with mock data for development

### Production Scripts

- **`start-prod.sh`** - Production deployment
  - Builds and serves the complete application
  - Single port deployment

### Database Scripts

- **`setup-database.sh`** - Database initialization
  - Creates PostgreSQL Docker container
  - Sets up database schema and tables
  - Loads predefined mock data for development and testing

- **`db-setup.sql`** - Database schema definitions
- **`mock-datas.sql`** - Predefined sample data for development and testing
  - Contains realistic test data for all database tables
  - Automatically loaded when running development scripts
- **`drop.sql`** - Database cleanup script

### Utility Scripts

- **`check-dependencies.sh`** - Dependency management
  - Checks for outdated packages
  - Suggests updates

- **`update-packages.sh`** - Package updates
  - Updates all project dependencies

## Development Workflow

1. **Initial Setup**:
   ```bash
   ./setup-database.sh
   ./start-dev.sh
   ```

2. **Daily Development**:
   ```bash
   ./start-dev.sh --skip-package-check
   ```

3. **Frontend Only Development**:
   ```bash
   ./start-dev-console-only.sh
   ```

4. **Remote Backend Development**:
   ```bash
   BACKEND_URL=http://your-remote-server:8085 ./start-dev-console-only.sh
   ```

## Ports and Services

- **Port 3000**: React development server (modern console UI)
- **Port 8085**: Backend API + prototype UI (compose-web-app)
- **Port 5432**: PostgreSQL database

## Hot Reload Features

When using `start-dev.sh`:
- **Backend**: Automatic restart on file changes (via nodemon)
- **Frontend**: Hot module replacement for instant updates
- **No manual restarts needed** - just save your files and see changes instantly

## Environment Requirements

- Node.js 18+
- Docker (for PostgreSQL)
- Yarn package manager
- Unix-like environment (Linux/macOS)
- curl (for backend health checks)

## Remote Backend Configuration

The console can connect to remote backends using the `BACKEND_URL` environment variable:

```bash
# Connect to local backend (default)
./start-dev-console-only.sh

# Connect to remote backend
BACKEND_URL=http://192.168.1.100:8085 ./start-dev-console-only.sh

# Connect to remote backend with HTTPS
BACKEND_URL=https://skupper-backend.example.com ./start-dev-console-only.sh
```

**Note**: Make sure the remote backend is accessible and CORS is properly configured.

## Troubleshooting

- If ports are busy, check for existing processes: `lsof -i :3000` or `lsof -i :8085`
- Database issues: Run `./setup-database.sh` to reinitialize
- Dependency conflicts: Run `./update-packages.sh` to sync all packages
- Remote backend connection issues:
  - Check network connectivity: `curl http://remote-backend:8085/healthz`
  - Verify CORS configuration on remote backend
  - Ensure firewall allows connections to remote backend port
