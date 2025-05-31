#!/bin/bash

# Local development script for AI Medical Intake Backend
# This script loads environment variables from .env and runs the backend locally

echo "🚀 Starting AI Medical Intake Backend locally..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and fill in your API keys:"
    echo "  cp .env.example .env"
    exit 1
fi

# Load environment variables from .env
export $(cat .env | grep -v '^#' | xargs)

# Check required environment variables
if [ -z "$ULTRAVOX_API_KEY" ] || [ -z "$GEMINI_API_KEY" ] || [ -z "$HF_API_TOKEN" ]; then
    echo "❌ Error: Missing required environment variables!"
    echo "Please ensure all required API keys are set in your .env file:"
    echo "  - ULTRAVOX_API_KEY"
    echo "  - GEMINI_API_KEY"
    echo "  - HF_API_TOKEN"
    exit 1
fi

echo "✅ Environment variables loaded successfully"

# Install dependencies if needed
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

echo "📦 Activating virtual environment..."
source venv/bin/activate

echo "📦 Installing dependencies..."
pip install -r requirements.txt

echo "🎯 Starting FastAPI server on http://localhost:8080"
echo "   Health check: http://localhost:8080/health"
echo "   API docs: http://localhost:8080/docs"
echo ""
echo "Press Ctrl+C to stop the server"

# Run the FastAPI app
python main.py