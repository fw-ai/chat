.PHONY: setup install install-frontend install-backend clean dev dev-frontend dev-backend build test lint help check-env

# Default target
help:
	@echo "FireChat Development Commands:"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          - Install all dependencies and setup environment"
	@echo "  make install        - Install/update all dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Start both frontend and backend in development mode"
	@echo "  make dev-frontend   - Start only the frontend development server"
	@echo "  make dev-backend    - Start only the backend development server"
	@echo ""
	@echo "Building and Testing:"
	@echo "  make build          - Build the frontend for production"
	@echo "  make test           - Run backend tests"
	@echo "  make lint           - Run frontend linting"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean          - Clean up build artifacts and caches"
	@echo "  make check-env      - Check environment configuration"

# Setup complete development environment
setup: install-frontend install-backend
	@echo "✓ Development environment setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "1. Copy environment file: cp .env.example .env.local"
	@echo "2. Add your FIREWORKS_API_KEY to .env.local"
	@echo "3. Start development: make dev"

# Install all dependencies
install: install-frontend install-backend

# Install frontend dependencies
install-frontend:
	@echo "Installing frontend dependencies..."
	@command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm is required but not installed. Please install pnpm first."; exit 1; }
	pnpm install

# Install backend dependencies using uv
install-backend:
	@echo "Setting up backend environment with uv..."
	cd api && ./scripts/install_uv.sh
	cd api && uv python install 3.11
	cd api && ./scripts/create_venv.sh
	cd api && . .venv/bin/activate && uv pip install -e .

# Start both frontend and backend in development mode
dev:
	@echo "Starting both frontend and backend servers..."
	@echo "Frontend: http://localhost:3000"
	@echo "Backend: http://localhost:8000"
	@echo "API Docs: http://localhost:8000/docs"
	@echo ""
	@echo "Press Ctrl+C to stop both servers"
	@trap 'kill %1 %2 2>/dev/null' INT; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

# Start only the frontend development server
dev-frontend:
	@echo "Starting frontend development server..."
	pnpm dev

# Start only the backend development server
dev-backend:
	@echo "Starting backend development server..."
	cd api && . .venv/bin/activate && python3 -m uvicorn src.routes.api_routes:app --reload --host 0.0.0.0 --port 8000

# Build frontend for production
build:
	@echo "Building frontend for production..."
	pnpm build

# Run backend tests
test:
	@echo "Running backend tests..."
	@if [ -d "api/tests" ]; then \
		cd api && . .venv/bin/activate && python -m pytest tests/ -v; \
	else \
		echo "No tests directory found in api/"; \
	fi

# Run frontend linting
lint:
	@echo "Running frontend linting..."
	pnpm lint

# Clean up build artifacts and caches
clean:
	@echo "Cleaning up build artifacts and caches..."
	# Frontend cleanup
	rm -rf .next
	rm -rf node_modules/.cache
	rm -rf dist
	# Backend cleanup
	rm -rf api/.venv
	rm -rf api/dist
	rm -rf api/*.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ipynb_checkpoints -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	@echo "✓ Cleanup complete"

# Check if environment is properly configured
check-env:
	@echo "Checking environment configuration..."
	@if [ ! -f .env.local ]; then \
		echo "Warning: .env.local not found. Copy .env.example to .env.local and add your FIREWORKS_API_KEY"; \
	else \
		echo "✓ .env.local found"; \
	fi
	@command -v pnpm >/dev/null 2>&1 && echo "✓ pnpm found" || echo "✗ pnpm not found"
	@command -v python3 >/dev/null 2>&1 && echo "✓ python3 found" || echo "✗ python3 not found"
	@command -v node >/dev/null 2>&1 && echo "✓ node found" || echo "✗ node not found"
	@if [ -f api/.venv/bin/activate ]; then \
		echo "✓ Backend virtual environment found"; \
	else \
		echo "✗ Backend virtual environment not found. Run 'make install-backend'"; \
	fi