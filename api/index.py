import sys
import os
from pathlib import Path

# Add the current directory to Python path for imports
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Now import the FastAPI app
from src.routes.api_routes import app

# Export the FastAPI app for Vercel
# Vercel expects the ASGI app to be named 'app'
app = app