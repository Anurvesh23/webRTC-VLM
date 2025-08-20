#!/bin/bash
set -e

# Clean up previous runs to avoid conflicts
docker-compose down --volumes > /dev/null 2>&1

echo "Building and running services with Docker..."
docker-compose up --build -d

echo ""
echo "Application is running!"
echo "--------------------------"
echo "Frontend available at: http://localhost:3000"
echo "Signaling server on:  http://localhost:3001"
echo "--------------------------"
echo "To see logs, run: docker-compose logs -f"
echo "To stop, run:   docker-compose down"