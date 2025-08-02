from typing import Dict, Any
from threading import Lock

from src.modules.llm_completion import FireworksConfig
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
                    cls._instance = cls()
                    cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initialize all services"""
        if self._initialized:
            return

        try:
            logger.info("Initializing application services...")

            # Initialize core config
            self._config = FireworksConfig()

            # Initialize dependent services
            self._session_manager = SessionManager(self._config.config)
            self._comparison_service = ComparisonService(self._session_manager)
            self._rate_limiter = DualLayerRateLimiter()

            # Load models
            self._models = self._config.get_all_models()

            self._initialized = True
            logger.info(
                f"Successfully initialized application services with {len(self._models)} models"
            )

        except Exception as e:
            logger.error(
                f"Failed to initialize application services: {str(e)}", exc_info=True
            )
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
        return self._models

    def is_initialized(self) -> bool:
        """Check if services are initialized"""
        return self._initialized


# Dependency functions for FastAPI
def get_app_services() -> AppServices:
    """FastAPI dependency to get AppServices singleton"""
    return AppServices.get_instance()


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
    services = get_app_services()
    return services.models
