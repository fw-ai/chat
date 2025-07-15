import sys
import os
from pathlib import Path

# Add the current directory to Python path for imports
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Now import the app
from src.routes.api_routes import app

# Export the FastAPI app for Vercel
handler = app