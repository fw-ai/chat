#!/bin/bash

# Redis Setup Script for Rate Limiting Tests
# This script helps you get Redis running locally for testing

set -e

echo "🔧 Setting up Redis for Rate Limiting Tests"
echo "============================================"

# Function to check if Redis is already running
check_redis() {
    if redis-cli ping >/dev/null 2>&1; then
        echo "✅ Redis is already running!"
        redis-cli info server | grep redis_version
        return 0
    else
        return 1
    fi
}

# Function to install Redis based on OS
install_redis() {
    echo "📦 Installing Redis..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew >/dev/null 2>&1; then
            echo "Installing Redis via Homebrew..."
            brew install redis
        else
            echo "❌ Homebrew not found. Please install Homebrew first or install Redis manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get >/dev/null 2>&1; then
            echo "Installing Redis via apt-get..."
            sudo apt-get update
            sudo apt-get install -y redis-server
        elif command -v yum >/dev/null 2>&1; then
            echo "Installing Redis via yum..."
            sudo yum install -y redis
        else
            echo "❌ Package manager not supported. Please install Redis manually."
            exit 1
        fi
    else
        echo "❌ OS not supported. Please install Redis manually."
        exit 1
    fi
}

# Function to start Redis
start_redis() {
    echo "🚀 Starting Redis server..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS with Homebrew
        brew services start redis
        echo "✅ Redis started as a service"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v systemctl >/dev/null 2>&1; then
            sudo systemctl start redis-server
            sudo systemctl enable redis-server
            echo "✅ Redis started via systemctl"
        else
            # Fallback to manual start
            redis-server --daemonize yes
            echo "✅ Redis started as daemon"
        fi
    fi
    
    # Wait a moment for Redis to start
    sleep 2
    
    # Verify it's running
    if check_redis; then
        echo "🎉 Redis is ready for testing!"
    else
        echo "❌ Failed to start Redis"
        exit 1
    fi
}

# Function to setup test data
setup_test_data() {
    echo "📊 Setting up test data in Redis..."
    
    # Clear any existing rate limiting data
    redis-cli --scan --pattern "*usage*" | xargs -r redis-cli del
    
    # Set some test data for demonstration
    today=$(date +%Y-%m-%d)
    redis-cli set "ip_usage:${today}:192.168.1.100" 3 EX 86400
    redis-cli set "prefix_usage:${today}:192.168" 15 EX 86400
    
    echo "✅ Test data created:"
    echo "   IP 192.168.1.100: 3/5 uses"
    echo "   Prefix 192.168.*: 15/50 uses"
}

# Function to show Redis info
show_redis_info() {
    echo "📋 Redis Information"
    echo "===================="
    echo "Redis CLI: $(which redis-cli)"
    echo "Redis Server: $(which redis-server)"
    echo "Connection: redis://localhost:6379"
    echo ""
    echo "💡 Useful commands:"
    echo "  redis-cli ping                    # Test connection"
    echo "  redis-cli keys '*usage*'         # Show rate limit keys"
    echo "  redis-cli flushdb                # Clear all data"
    echo "  redis-cli monitor                # Watch live commands"
}

# Main execution
main() {
    if check_redis; then
        echo "Redis is already running. Skipping installation."
    else
        echo "Redis not running. Checking if installed..."
        
        if ! command -v redis-server >/dev/null 2>&1; then
            echo "Redis not installed. Installing..."
            install_redis
        fi
        
        start_redis
    fi
    
    setup_test_data
    show_redis_info
    
    echo ""
    echo "🎯 Ready for testing! You can now:"
    echo "   1. Run pytest: python -m pytest api/tests/test_rate_limiting.py -v"
    echo "   2. Run manual tests: python api/test_manual_rate_limiting.py"
    echo "   3. Start your API server: uvicorn api.index:app --reload"
}

# Check if script is being run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi 