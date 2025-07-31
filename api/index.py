import sys
from pathlib import Path
from src.routes.api_routes import app

# Add the current directory to Python path for imports
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Export the FastAPI app for Vercel
# Vercel expects the ASGI app to be named 'app'
app = app
