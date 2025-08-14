from pathlib import Path
import yaml
import sys
from src.logger import logger


def _find_config_path():
    """Find the config directory using multiple strategies"""
    # Strategy 1: Relative to this file (original approach)
    file_path = Path(__file__).parents[2]
    config_path = file_path / "configs"
    if config_path.exists():
        return config_path

    # Strategy 2: Relative to working directory
    cwd_config = Path.cwd() / "api" / "configs"
    if cwd_config.exists():
        return cwd_config

    # Strategy 3: Look for configs directory in common locations
    for search_path in [
        Path.cwd(),
        Path.cwd().parent,
        Path(__file__).parent.parent.parent,
    ]:
        config_dir = search_path / "configs"
        if config_dir.exists():
            return config_dir

    # Strategy 4: Check if we're in a serverless environment with absolute paths
    configs_dir = Path("/var/task/api/configs")
    if configs_dir.exists():
        return configs_dir

    raise FileNotFoundError(
        f"Could not find configs directory. Current working directory: {Path.cwd()}"
    )


def _load_config(config_dir, filename):
    """Load a config file with error handling"""
    try:
        config_path = config_dir / filename
        logger.info(f"Loading config from: {config_path}")
        with open(config_path, "r") as f:
            return yaml.safe_load(f)
    except Exception as e:
        logger.info(f"Error loading {filename}: {e}")
        logger.info(
            f"Config directory contents: {list(config_dir.iterdir()) if config_dir.exists() else 'Directory does not exist'}"
        )
        raise


try:
    _CONFIG_DIR = _find_config_path()
    logger.info(f"Found config directory: {_CONFIG_DIR}")
    APP_CONFIG = _load_config(_CONFIG_DIR, "config.yaml")
    PROMPT_LIBRARY = _load_config(_CONFIG_DIR, "prompt_library.yaml")
except Exception as e:
    logger.info(f"Critical error loading configuration: {e}")
    logger.info(f"Current working directory: {Path.cwd()}")
    logger.info(f"File location: {Path(__file__)}")
    logger.info(f"Python path: {sys.path}")
    raise
