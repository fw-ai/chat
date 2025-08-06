import redis.asyncio as redis
from redis.exceptions import ConnectionError, TimeoutError
from typing import Tuple, Dict, Optional, Union, Any
import ipaddress
from datetime import datetime
import os
from dataclasses import dataclass

from src.constants.configs import APP_CONFIG
from src.logger import logger
from fastapi import HTTPException, Request
from src.modules.auth import extract_client_ip


@dataclass
class RateLimitInfo:
    ip_usage: int
    ip_limit: int
    prefix_usage: int
    prefix_limit: int
    limit_reason: str = ""

    @property
    def ip_remaining(self) -> int:
        return max(0, self.ip_limit - self.ip_usage)

    @property
    def prefix_remaining(self) -> int:
        return max(0, self.prefix_limit - self.prefix_usage)


class DualLayerRateLimiter:
    def __init__(self, redis_url: str = None):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        logger.info(
            f"Initializing DualLayerRateLimiter "
            f"with Redis URL: {self.redis_url[-20:] if len(self.redis_url) > 20 else self.redis_url}"
        )
        self.redis: Optional[redis.Redis] = None
        self.IP_LIMIT = APP_CONFIG["rate_limiting"]["individual_ip_limit"]
        self.PREFIX_LIMIT = APP_CONFIG["rate_limiting"]["ip_prefix_limit"]
        self._connection_attempts = 0
        self._last_successful_connection = None
        logger.info(
            f"Rate limiter configured - IP limit: {self.IP_LIMIT}, Prefix limit: {self.PREFIX_LIMIT}"
        )

    async def _get_redis(self) -> redis.Redis:
        """Get Redis connection with proper error handling for closed event loops"""
        self._connection_attempts += 1
        logger.debug(f"Getting Redis connection (attempt #{self._connection_attempts})")

        try:
            # Check if existing connection is still valid
            if self.redis is not None:
                try:
                    logger.debug("Testing existing Redis connection with ping...")
                    start_time = datetime.now()
                    await self.redis.ping()
                    ping_duration = (datetime.now() - start_time).total_seconds()
                    logger.debug(
                        f"Redis ping successful in {ping_duration:.3f}s - reusing connection"
                    )
                    return self.redis
                except Exception as e:
                    logger.warning(
                        f"Existing Redis connection failed ping test: {str(e)} - creating new connection"
                    )
                    # Connection is stale, close it and create a new one
                    try:
                        await self.redis.aclose()
                        logger.debug("Closed stale Redis connection")
                    except Exception as close_error:
                        logger.debug(
                            f"Error closing stale connection (expected): {str(close_error)}"
                        )
                    self.redis = None

            # Create a fresh connection
            logger.info(
                f"Creating new Redis connection to {self.redis_url[-20:] if len(self.redis_url) > 20 else self.redis_url}"
            )
            start_time = datetime.now()

            self.redis = redis.from_url(
                self.redis_url,
                decode_responses=True,
                retry_on_error=[ConnectionError, TimeoutError],
                retry_on_timeout=True,
                health_check_interval=30,
                socket_keepalive=True,
                socket_keepalive_options={},
            )

            # Test the new connection
            await self.redis.ping()
            connection_time = (datetime.now() - start_time).total_seconds()
            self._last_successful_connection = datetime.now()

            logger.info(
                f"Redis connection established successfully in {connection_time:.3f}s"
            )
            return self.redis

        except ConnectionError as e:
            logger.error(f"Redis connection failed (ConnectionError): {str(e)}")
            raise
        except TimeoutError as e:
            logger.error(f"Redis connection timeout: {str(e)}")
            raise
        except Exception as e:
            logger.error(
                f"Failed to create Redis connection (unexpected error): {str(e)}"
            )
            raise

    async def close(self):
        """Close Redis connection gracefully"""
        if self.redis is not None:
            try:
                await self.redis.aclose()
                logger.info("Redis connection closed successfully")
            except Exception as e:
                logger.warning(f"Error closing Redis connection: {str(e)}")
            finally:
                self.redis = None

    async def get_connection_status(self) -> Dict[str, Any]:
        """Get diagnostic information about Redis connection status"""
        status = {
            "redis_url_suffix": (
                self.redis_url[-20:] if len(self.redis_url) > 20 else self.redis_url
            ),
            "connection_attempts": self._connection_attempts,
            "last_successful_connection": (
                str(self._last_successful_connection)
                if self._last_successful_connection
                else None
            ),
            "has_active_connection": self.redis is not None,
            "ip_limit": self.IP_LIMIT,
            "prefix_limit": self.PREFIX_LIMIT,
        }

        if self.redis is not None:
            try:
                start_time = datetime.now()
                await self.redis.ping()
                ping_time = (datetime.now() - start_time).total_seconds()
                status["connection_healthy"] = True
                status["ping_time_seconds"] = round(ping_time, 3)
            except Exception as e:
                status["connection_healthy"] = False
                status["ping_error"] = str(e)
        else:
            status["connection_healthy"] = False
            status["ping_error"] = "No active connection"

        return status

    def _get_prefix_key(self, ip: str) -> Tuple[str, str]:
        today = datetime.now().strftime("%Y-%m-%d")
        ip_key = f"ip_usage:{today}:{ip}"
        prefix = self.extract_ip_prefix(ip)
        prefix_key = f"prefix_usage:{today}:{prefix}"

        return ip_key, prefix_key

    async def _get_usage_info(
        self, redis_client: redis.Redis, ip: str
    ) -> Dict[str, Union[int, str, redis.Redis]]:
        """
        Get current usage without incrementing

        Returns:
            (ip_usage: int, prefix_usage: int, redis_client: redis.Redis)
        """
        ip_key, prefix_key = self._get_prefix_key(ip)

        pipe = redis_client.pipeline()
        pipe.get(ip_key)
        pipe.get(prefix_key)
        current_usage = await pipe.execute()

        return {
            "ip_key": ip_key,
            "prefix_key": prefix_key,
            "ip_usage": int(current_usage[0] or 0),
            "prefix_usage": int(current_usage[1] or 0),
        }

    @staticmethod
    def extract_ip_prefix(ip: str) -> str:
        """Extract first two octets: 192.168.1.100 -> 192.168"""
        try:
            # Validate IP format (handles both IPv4 and IPv6)
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.version == 4:
                octets = str(ip_obj).split(".")
                return f"{octets[0]}.{octets[1]}"
            else:
                # For IPv6, use first 4 groups - simple split
                ip_str = str(ip_obj)
                # Split by : and take first 4 parts
                groups = ip_str.split(":")
                # Handle empty groups from compressed notation
                filtered_groups = [g for g in groups[:4] if g]
                # Pad to 4 if we have less
                while len(filtered_groups) < 4:
                    filtered_groups.append("0")
                return ":".join(filtered_groups[:4])
        except ValueError:
            # Fallback for invalid IPs - just truncate
            return ip[:10]

    async def check_and_increment_usage(self, ip: str) -> Tuple[bool, RateLimitInfo]:
        """
        Check both IP and prefix limits, increment if allowed

        Returns:
            (allowed: bool, rate_limit_info: RateLimitInfo)
        """
        logger.debug(f"Rate limit check for IP: {ip}")
        try:
            redis_client = await self._get_redis()
            usage_info = await self._get_usage_info(ip=ip, redis_client=redis_client)
            logger.debug(
                f"Retrieved usage info for IP {ip}: IP usage={usage_info['ip_usage']}, Prefix usage={usage_info['prefix_usage']}"
            )

            ip_key = usage_info["ip_key"]
            prefix_key = usage_info["prefix_key"]
            ip_usage = usage_info["ip_usage"]
            prefix_usage = usage_info["prefix_usage"]

            # Check limits
            if ip_usage >= self.IP_LIMIT:
                logger.warning(
                    f"Rate limit EXCEEDED for IP {ip} - Individual IP limit: {ip_usage}/{self.IP_LIMIT}"
                )
                return False, RateLimitInfo(
                    ip_usage=ip_usage,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=prefix_usage,
                    prefix_limit=self.PREFIX_LIMIT,
                    limit_reason="individual_ip",
                )

            if prefix_usage >= self.PREFIX_LIMIT:
                prefix = self.extract_ip_prefix(ip)
                logger.warning(
                    f"Rate limit EXCEEDED for IP {ip} - Prefix limit for {prefix}: {prefix_usage}/{self.PREFIX_LIMIT}"
                )
                return False, RateLimitInfo(
                    ip_usage=ip_usage,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=prefix_usage,
                    prefix_limit=self.PREFIX_LIMIT,
                    limit_reason="ip_prefix",
                )

            pipe = redis_client.pipeline()
            pipe.incr(ip_key)
            pipe.expire(ip_key, 86400)  # 24 hours in seconds
            pipe.incr(prefix_key)
            pipe.expire(prefix_key, 86400)  # 24 hours in seconds

            logger.debug(f"Executing Redis pipeline to increment usage for IP {ip}")
            start_time = datetime.now()
            await pipe.execute()
            pipeline_duration = (datetime.now() - start_time).total_seconds()

            logger.info(
                f"Rate limit check PASSED for IP {ip} (pipeline: {pipeline_duration:.3f}s) - New usage: IP={ip_usage + 1}/{self.IP_LIMIT}, Prefix={prefix_usage + 1}/{self.PREFIX_LIMIT}"
            )

            return True, RateLimitInfo(
                ip_usage=ip_usage + 1,
                ip_limit=self.IP_LIMIT,
                prefix_usage=prefix_usage + 1,
                prefix_limit=self.PREFIX_LIMIT,
                limit_reason="",
            )

        except (ConnectionError, TimeoutError) as e:
            logger.error(
                f"Redis connection error for IP {ip}: {str(e)}. FAILING OPEN - allowing request. Connection attempts: {self._connection_attempts}"
            )
            # Fail open for connection issues to avoid blocking legitimate users
            return True, RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
                limit_reason="connection_error",
            )
        except RuntimeError as e:
            if "Event loop is closed" in str(e) or "no running event loop" in str(e):
                logger.error(
                    f"Event loop error in rate limiter for IP {ip}: {str(e)}. FAILING OPEN - allowing request. Last successful connection: {self._last_successful_connection}"
                )
                # Fail open for event loop issues
                return True, RateLimitInfo(
                    ip_usage=0,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=0,
                    prefix_limit=self.PREFIX_LIMIT,
                    limit_reason="event_loop_error",
                )
            else:
                logger.critical(
                    f"RATE_LIMITER_FAILURE for IP {ip}: {str(e)}. FAILING CLOSED - denying request."
                )
                # Fail closed for other runtime errors
                return False, RateLimitInfo(
                    ip_usage=0,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=0,
                    prefix_limit=self.PREFIX_LIMIT,
                    limit_reason="error_failclosed",
                )
        except Exception as e:
            logger.critical(
                f"RATE_LIMITER_FAILURE for IP {ip}: {str(e)}. FAILING CLOSED - denying request. Connection attempts: {self._connection_attempts}"
            )
            # Fail closed - deny request if Redis is down
            return False, RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
                limit_reason="error_failclosed",
            )

    async def get_usage_info(self, ip: str) -> RateLimitInfo:
        """Get current usage without incrementing"""
        try:
            redis_client = await self._get_redis()
            usage_info = await self._get_usage_info(ip=ip, redis_client=redis_client)

            ip_usage = usage_info["ip_usage"]
            prefix_usage = usage_info["prefix_usage"]

            return RateLimitInfo(
                ip_usage=ip_usage,
                ip_limit=self.IP_LIMIT,
                prefix_usage=prefix_usage,
                prefix_limit=self.PREFIX_LIMIT,
            )
        except (ConnectionError, TimeoutError) as e:
            logger.error(f"Redis connection error getting usage info: {str(e)}")
            return RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
            )
        except RuntimeError as e:
            if "Event loop is closed" in str(e) or "no running event loop" in str(e):
                logger.error(f"Event loop error getting usage info: {str(e)}")
                return RateLimitInfo(
                    ip_usage=0,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=0,
                    prefix_limit=self.PREFIX_LIMIT,
                )
            else:
                logger.error(f"Runtime error getting usage info: {str(e)}")
                return RateLimitInfo(
                    ip_usage=0,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=0,
                    prefix_limit=self.PREFIX_LIMIT,
                )
        except Exception as e:
            logger.error(f"Error getting usage info: {str(e)}")
            return RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
            )


async def verify_rate_limit(
    http_request: Request,
    rate_limiter: DualLayerRateLimiter,
    comparison_id: Optional[str] = None,
):
    """
    Verify rate limit

    Args:
        http_request (Request): HTTP request object
        rate_limiter (RateLimiter): Rate limiter instance
        comparison_id (Optional[str]): Comparison ID for side-by-side chats

    Returns:
        HTTPException: HTTPException if rate limit exceeded
    """
    client_ip = extract_client_ip(http_request)

    # For comparison requests, use comparison_id to ensure we only count once per user input
    rate_limit_key = f"{client_ip}:{comparison_id}" if comparison_id else client_ip

    allowed, usage_info = await rate_limiter.check_and_increment_usage(rate_limit_key)

    if not allowed:
        if usage_info.limit_reason == "individual_ip":
            detail = "Daily limit exceeded, sign in with a Fireworks API key for unlimited access."
        else:
            detail = (
                f"Network limit exceeded: {usage_info.prefix_limit} messages per network. "
                f"This may be due to shared VPN/corporate network usage. "
                f"Sign in with a Fireworks API key for unlimited access."
            )

        raise HTTPException(
            status_code=429,
            detail=detail,
            headers={
                "X-RateLimit-Limit-IP": str(usage_info.ip_limit),
                "X-RateLimit-Remaining-IP": str(
                    max(0, usage_info.ip_limit - usage_info.ip_usage)
                ),
                "X-RateLimit-Limit-Prefix": str(usage_info.prefix_limit),
                "X-RateLimit-Remaining-Prefix": str(
                    max(0, usage_info.prefix_limit - usage_info.prefix_usage)
                ),
            },
        )
    rate_limit_type = "comparison" if comparison_id else "single"
    logger.info(
        f"Rate limit check passed for {rate_limit_type} chat - Key: {rate_limit_key}, Remaining: {usage_info.ip_remaining}"
    )
