from typing import Dict, Any
from threading import Lock
import os

from llm_inference.llm_completion import FireworksConfig
from src.modules.session import SessionManager
from src.modules.rate_limiter import DualLayerRateLimiter
from src.services.comparison_service import ComparisonService
from src.logger import logger


class AppServices:
    """
    Singleton service container for application dependencies.

    This class manages the lifecycle of all core services and ensures
    they are properly initialized and accessible throughout the application.
    """

    _instance = None
    _lock = Lock()

    def __init__(self):
        """Initialize services - should only be called once via get_instance()"""
        self._config = None
        self._session_manager = None
        self._comparison_service = None
        self._rate_limiter = None
        self._models = None
        self._initialized = False

    @classmethod
    def get_instance(cls) -> "AppServices":
        """Get singleton instance with thread-safe initialization"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    try:
                        logger.info("Creating AppServices singleton instance...")
                        cls._instance = cls()
                        cls._instance._initialize()
                        logger.info(
                            "AppServices singleton instance created successfully"
                        )
                    except Exception as e:
                        logger.error(
                            f"Failed to create AppServices singleton: {str(e)}",
                            exc_info=True,
                        )
                        cls._instance = None  # Reset to None on failure
                        raise
        return cls._instance

    def _initialize(self):
        """Initialize all services"""
        if self._initialized:
            return

        try:
            logger.info("Initializing application services...")

            # Initialize core config
            logger.info("Loading FireworksConfig...")
            self._config = FireworksConfig()
            logger.info("FireworksConfig loaded successfully")

            # Load models first to validate config
            logger.info("Loading models from config...")
            self._models = self._config.get_all_models()
            logger.info(
                f"Loaded {len(self._models) if self._models else 0} models from config"
            )

            # Initialize dependent services
            logger.info("Initializing SessionManager...")
            self._session_manager = SessionManager(self._config.config)
            logger.info("SessionManager initialized")

            logger.info("Initializing ComparisonService...")
            self._comparison_service = ComparisonService(self._session_manager)
            logger.info("ComparisonService initialized")

            logger.info("Initializing DualLayerRateLimiter...")
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
            logger.info(
                f"Creating DualLayerRateLimiter with Redis URL ending: {redis_url[-20:] if len(redis_url) > 20 else redis_url}"
            )
            self._rate_limiter = DualLayerRateLimiter()
            logger.info("DualLayerRateLimiter initialization completed")

            self._initialized = True
            logger.info(
                f"Successfully initialized application services with {len(self._models)} models"
            )

        except Exception as e:
            logger.error(
                f"Failed to initialize application services: {str(e)}", exc_info=True
            )
            # Reset state on failure
            self._config = None
            self._session_manager = None
            self._comparison_service = None
            self._rate_limiter = None
            self._models = None
            self._initialized = False
            raise

    @property
    def config(self) -> FireworksConfig:
        """Get FireworksConfig instance"""
        if not self._initialized:
            raise RuntimeError("Services not initialized")
        return self._config

    @property
    def session_manager(self) -> SessionManager:
        """Get SessionManager instance"""
        if not self._initialized:
            raise RuntimeError("Services not initialized")
        return self._session_manager

    @property
    def comparison_service(self) -> ComparisonService:
        """Get ComparisonService instance"""
        if not self._initialized:
            raise RuntimeError("Services not initialized")
        return self._comparison_service

    @property
    def rate_limiter(self) -> DualLayerRateLimiter:
        """Get DualLayerRateLimiter instance"""
        if not self._initialized:
            raise RuntimeError("Services not initialized")
        return self._rate_limiter

    @property
    def models(self) -> Dict[str, Any]:
        """Get models dictionary"""
        if not self._initialized:
            raise RuntimeError("Services not initialized")
        if self._models is None:
            logger.error("Models is None even though services are initialized")
            return {}
        return self._models

    def is_initialized(self) -> bool:
        """Check if services are initialized"""
        return self._initialized

    async def cleanup(self):
        """Cleanup all services and connections"""
        if self._rate_limiter is not None:
            try:
                await self._rate_limiter.close()
                logger.info("Rate limiter cleaned up successfully")
            except Exception as e:
                logger.error(f"Error cleaning up rate limiter: {str(e)}")

        # Reset all services
        self._config = None
        self._session_manager = None
        self._comparison_service = None
        self._rate_limiter = None
        self._models = None
        self._initialized = False
        logger.info("AppServices cleanup completed")


# Dependency functions for FastAPI
def get_app_services() -> AppServices:
    """FastAPI dependency to get AppServices singleton"""
    try:
        return AppServices.get_instance()
    except Exception as e:
        logger.error(
            f"get_app_services: Failed to get AppServices instance: {str(e)}",
            exc_info=True,
        )
        raise


def get_config() -> FireworksConfig:
    """FastAPI dependency to get FireworksConfig"""
    services = get_app_services()
    return services.config


def get_session_manager() -> SessionManager:
    """FastAPI dependency to get SessionManager"""
    services = get_app_services()
    return services.session_manager


def get_comparison_service() -> ComparisonService:
    """FastAPI dependency to get ComparisonService"""
    services = get_app_services()
    return services.comparison_service


def get_rate_limiter() -> DualLayerRateLimiter:
    """FastAPI dependency to get DualLayerRateLimiter"""
    services = get_app_services()
    return services.rate_limiter


def get_models() -> Dict[str, Any]:
    """FastAPI dependency to get models dictionary"""
    try:
        services = get_app_services()
        models = services.models
        logger.info(f"get_models: Retrieved {len(models) if models else 0} models")
        return models
    except Exception as e:
        logger.error(f"get_models: Failed to get models: {str(e)}", exc_info=True)
        return {}
