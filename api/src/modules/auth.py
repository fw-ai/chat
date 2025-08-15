import re
import aiohttp
from fastapi import HTTPException, Request
from typing import Optional

from constants.configs import APP_CONFIG
from src.logger import logger


def extract_api_key_from_request(request: Request) -> str:
    """
    Extract API key from Authorization header.

    Args:
        request: FastAPI request object

    Returns:
        str: The extracted API key

    Raises:
        HTTPException: If Authorization header is missing or malformed
    """
    auth_header = request.headers.get("authorization")
    if not auth_header:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header. Please provide your Fireworks API key.",
        )

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header format. Expected: Bearer <api_key>",
        )

    api_key = auth_header[7:]  # Remove "Bearer " prefix
    return api_key


def validate_fireworks_api_key_format(api_key: str) -> bool:
    """
    Validate Fireworks API key format.

    Fireworks API keys follow the pattern: fw_ followed by 24 alphanumeric characters

    Args:
        api_key: The API key to validate

    Returns:
        bool: True if format is valid, False otherwise
    """
    if not api_key:
        return False

    fireworks_api_key_pattern = r"^fw_[a-zA-Z0-9]{24}$"
    return bool(re.match(fireworks_api_key_pattern, api_key))


async def test_api_key_with_fireworks(api_key: str) -> bool:
    """
    Test if API key works with Fireworks API by making a simple request.

    This makes a lightweight request to the Fireworks API to verify
    the API key is valid and not expired.

    Args:
        api_key: The API key to test

    Returns:
        bool: True if API key is valid, False otherwise
    """
    try:
        async with aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }

            async with session.get(
                APP_CONFIG["web_app_model_library_url"],
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=2),
            ) as response:
                return response.status == 200

    except Exception as e:
        logger.debug(f"API key validation failed: {str(e)[:100]}...")
        return False


async def get_validated_api_key(request: Request) -> str:
    """
    Extract and validate API key from request with comprehensive checks.

    This function:
    1. Extracts the API key from Authorization header
    2. Validates the format (fw_ + 24 chars)
    3. Tests the key with Fireworks API

    Args:
        request: FastAPI request object

    Returns:
        str: Valid API key

    Raises:
        HTTPException: If API key is missing, malformed, or invalid
    """
    try:
        api_key = extract_api_key_from_request(request)

        if not validate_fireworks_api_key_format(api_key):
            raise HTTPException(
                status_code=401,
                detail="Invalid API key format. Expected: fw_ followed by 24 alphanumeric characters",
            )

        if not await test_api_key_with_fireworks(api_key):
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired API key. Please check your Fireworks API key.",
            )

        return api_key

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error validating API key: {str(e)[:100]}...")
        raise HTTPException(status_code=500, detail="Failed to validate API key")


async def get_optional_api_key(request: Request) -> Optional[str]:
    """
    Extract and validate API key if present, return None if missing/invalid.

    This allows unauthenticated requests to proceed for rate limiting.

    Returns:
        str: Valid API key if present and valid
        None: If no API key or invalid API key
    """
    try:
        return await get_validated_api_key(request)
    except HTTPException as e:
        # Log for debugging but don't raise
        if e.status_code != 401:
            logger.warning(f"Unexpected auth error: {e.detail}")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error in optional auth: {str(e)[:100]}...")
        return None


def extract_client_ip(request: Request) -> str:
    """
    Extract client IP with proper proxy support for Vercel/Cloudflare.

    Args:
        request: FastAPI request object

    Returns:
        str: Client IP address
    """
    headers_to_check = [
        "cf-connecting-ip",  # Cloudflare
        "x-vercel-forwarded-for",  # Vercel
        "x-forwarded-for",  # Standard proxy
        "x-real-ip",  # Nginx
        "x-client-ip",  # Alternative
    ]

    for header in headers_to_check:
        value = request.headers.get(header)
        if value:
            # Handle comma-separated IPs (take first/leftmost = original client)
            ip = value.split(",")[0].strip()
            if ip and ip != "unknown":
                return ip

    ip_address = request.client.host
    logger.info(f"Client IP: {ip_address}")
    return ip_address


def get_api_key_safe_for_logging(api_key: str) -> str:
    """
    Get a safe version of API key for logging purposes.

    Returns the last 4 characters with masking
    in between to allow for debugging without exposing the full key.

    Args:
        api_key: The API key to mask

    Returns:
        str: Masked API key safe for logging (e.g., "fw_abc...xyz1")
    """
    if not api_key or len(api_key) < 10:
        return "invalid_key"

    return f"{api_key[:2]}...{api_key[-4:]}"
