#!/bin/bash

# Development script for Skupper-X Management Controller
# Sets up environment variables and starts nodemon

# Database configuration
export SKX_STANDALONE_NAMESPACE=default
export PGUSER=access
export PGHOST=localhost
export PGPASSWORD=password
export PGDATABASE=studiodb
export PGPORT=5432
export SKX_CONTROLLER_NAME=dev-controller
export NODE_ENV=development

echo "🚀 Starting Management Controller in development mode..."
echo "Environment variables set:"
echo "  PGHOST: $PGHOST"
echo "  PGDATABASE: $PGDATABASE"
echo "  PGUSER: $PGUSER"
echo "  SKX_CONTROLLER_NAME: $SKX_CONTROLLER_NAME"
echo ""

# Start nodemon
npx nodemon index.js
