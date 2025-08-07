import redis.asyncio as redis
from typing import Tuple
from datetime import datetime
import os
import ipaddress
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
        # Use config values - with 10 IP limit, users get 5 effective messages (side-by-side counts as 2)
        self.IP_LIMIT = APP_CONFIG["rate_limiting"]["individual_ip_limit"]
        self.PREFIX_LIMIT = APP_CONFIG["rate_limiting"]["ip_prefix_limit"]
        logger.info(
            f"Dual layer rate limiter configured - IP limit: {self.IP_LIMIT}, Prefix limit: {self.PREFIX_LIMIT}"
        )

    async def _get_redis_client(self) -> redis.Redis:
        """Create a fresh Redis client for each operation - no connection reuse"""
        return redis.from_url(
            self.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )

    def _get_keys(self, ip: str) -> Tuple[str, str]:
        """Get Redis keys for IP and prefix"""
        today = datetime.now().strftime("%Y-%m-%d")
        ip_key = f"ip_usage:{today}:{ip}"
        prefix = self.extract_ip_prefix(ip)
        prefix_key = f"prefix_usage:{today}:{prefix}"
        return ip_key, prefix_key

    @staticmethod
    def extract_ip_prefix(ip: str) -> str:
        """Extract first two octets: 192.168.1.100 -> 192.168"""
        try:
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.version == 4:
                octets = str(ip_obj).split(".")
                return f"{octets[0]}.{octets[1]}"
            else:
                # For IPv6, use first 4 groups
                # Convert to full representation to handle compressed notation
                full_ipv6 = ip_obj.exploded
                groups = full_ipv6.split(":")[:4]
                return ":".join(groups)
        except ValueError:
            # Fallback for invalid IPs
            return ip[:10]

    async def check_and_increment_usage(self, ip: str) -> Tuple[bool, RateLimitInfo]:
        """
        Simple dual-layer rate limiting: check IP and prefix limits, increment if allowed

        Returns:
            (allowed: bool, rate_limit_info: RateLimitInfo)
        """
        try:
            client = await self._get_redis_client()
            try:
                ip_key, prefix_key = self._get_keys(ip)

                # Get current usage for both IP and prefix
                ip_usage = await client.get(ip_key)
                prefix_usage = await client.get(prefix_key)

                ip_usage = int(ip_usage or 0)
                prefix_usage = int(prefix_usage or 0)

                logger.debug(
                    f"Rate limit check for IP {ip}: IP={ip_usage}/{self.IP_LIMIT}, Prefix={prefix_usage}/{self.PREFIX_LIMIT}"
                )

                # Check limits
                if ip_usage >= self.IP_LIMIT:
                    logger.warning(
                        f"IP rate limit exceeded for {ip}: {ip_usage}/{self.IP_LIMIT}"
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
                        f"Prefix rate limit exceeded for {ip} (prefix {prefix}): {prefix_usage}/{self.PREFIX_LIMIT}"
                    )
                    return False, RateLimitInfo(
                        ip_usage=ip_usage,
                        ip_limit=self.IP_LIMIT,
                        prefix_usage=prefix_usage,
                        prefix_limit=self.PREFIX_LIMIT,
                        limit_reason="ip_prefix",
                    )

                # Increment both counters
                await client.incr(ip_key)
                await client.expire(ip_key, 86400)  # 24 hours
                await client.incr(prefix_key)
                await client.expire(prefix_key, 86400)  # 24 hours

                new_ip_usage = ip_usage + 1
                new_prefix_usage = prefix_usage + 1

                logger.info(
                    f"Rate limit check passed for IP {ip}: IP={new_ip_usage}/{self.IP_LIMIT}, Prefix={new_prefix_usage}/{self.PREFIX_LIMIT}"
                )

                return True, RateLimitInfo(
                    ip_usage=new_ip_usage,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=new_prefix_usage,
                    prefix_limit=self.PREFIX_LIMIT,
                )

            finally:
                await client.aclose()

        except Exception as e:
            logger.error(
                f"Redis error for IP {ip}: {str(e)}. FAILING OPEN - allowing request"
            )
            # Fail open - allow the request if Redis is down
            return True, RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
                limit_reason="redis_error",
            )

    async def increment_usage(
        self, ip: str, count: int = 1
    ) -> Tuple[bool, RateLimitInfo]:
        """
        Increment usage by specified count (1 for single chat, 2 for side-by-side)

        Returns:
            (allowed: bool, rate_limit_info: RateLimitInfo)
        """
        try:
            client = await self._get_redis_client()
            try:
                ip_key, prefix_key = self._get_keys(ip)

                # Get current usage for both IP and prefix
                ip_usage = await client.get(ip_key)
                prefix_usage = await client.get(prefix_key)

                ip_usage = int(ip_usage or 0)
                prefix_usage = int(prefix_usage or 0)

                logger.debug(
                    f"Increment usage check for IP {ip} (count={count}): IP={ip_usage}/{self.IP_LIMIT}, Prefix={prefix_usage}/{self.PREFIX_LIMIT}"
                )

                # Check if incrementing by count would exceed limits
                if ip_usage + count > self.IP_LIMIT:
                    logger.warning(
                        f"IP rate limit would be exceeded for {ip}: {ip_usage}+{count} > {self.IP_LIMIT}"
                    )
                    return False, RateLimitInfo(
                        ip_usage=ip_usage,
                        ip_limit=self.IP_LIMIT,
                        prefix_usage=prefix_usage,
                        prefix_limit=self.PREFIX_LIMIT,
                        limit_reason="individual_ip",
                    )

                if prefix_usage + count > self.PREFIX_LIMIT:
                    prefix = self.extract_ip_prefix(ip)
                    logger.warning(
                        f"Prefix rate limit would be exceeded for {ip} (prefix {prefix}): {prefix_usage}+{count} > {self.PREFIX_LIMIT}"
                    )
                    return False, RateLimitInfo(
                        ip_usage=ip_usage,
                        ip_limit=self.IP_LIMIT,
                        prefix_usage=prefix_usage,
                        prefix_limit=self.PREFIX_LIMIT,
                        limit_reason="ip_prefix",
                    )

                # Increment both counters by count
                for _ in range(count):
                    await client.incr(ip_key)
                    await client.incr(prefix_key)

                await client.expire(ip_key, 86400)  # 24 hours
                await client.expire(prefix_key, 86400)  # 24 hours

                new_ip_usage = ip_usage + count
                new_prefix_usage = prefix_usage + count

                logger.info(
                    f"Usage incremented for IP {ip} (count={count}): IP={new_ip_usage}/{self.IP_LIMIT}, Prefix={new_prefix_usage}/{self.PREFIX_LIMIT}"
                )

                return True, RateLimitInfo(
                    ip_usage=new_ip_usage,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=new_prefix_usage,
                    prefix_limit=self.PREFIX_LIMIT,
                )

            finally:
                await client.aclose()

        except Exception as e:
            logger.error(
                f"Redis error for IP {ip}: {str(e)}. FAILING OPEN - allowing request"
            )
            # Fail open - allow the request if Redis is down
            return True, RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
                limit_reason="redis_error",
            )

    async def get_usage_info(self, ip: str) -> RateLimitInfo:
        """Get current usage without incrementing"""
        try:
            client = await self._get_redis_client()
            try:
                ip_key, prefix_key = self._get_keys(ip)

                ip_usage = await client.get(ip_key)
                prefix_usage = await client.get(prefix_key)

                return RateLimitInfo(
                    ip_usage=int(ip_usage or 0),
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=int(prefix_usage or 0),
                    prefix_limit=self.PREFIX_LIMIT,
                )
            finally:
                await client.aclose()

        except Exception as e:
            logger.error(f"Error getting usage info for IP {ip}: {str(e)}")
            return RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
                limit_reason="redis_error",
            )


def _create_rate_limit_error_response(usage_info: RateLimitInfo) -> HTTPException:
    """Create standardized rate limit error response"""
    if usage_info.limit_reason == "individual_ip":
        detail = "Daily limit exceeded. Sign in with a Fireworks API key for unlimited access."
    else:
        detail = (
            f"Network limit exceeded: {usage_info.prefix_limit} messages per network. "
            f"This may be due to shared VPN/corporate network usage. "
            f"Sign in with a Fireworks API key for unlimited access."
        )

    return HTTPException(
        status_code=429,
        detail=detail,
        headers={
            "X-RateLimit-Limit-IP": str(usage_info.ip_limit),
            "X-RateLimit-Remaining-IP": str(usage_info.ip_remaining),
            "X-RateLimit-Limit-Prefix": str(usage_info.prefix_limit),
            "X-RateLimit-Remaining-Prefix": str(usage_info.prefix_remaining),
        },
    )


async def verify_rate_limit(request: Request, rate_limiter: DualLayerRateLimiter):
    """
    Dual-layer rate limit verification

    Args:
        request: HTTP request object
        rate_limiter: Rate limiter instance

    Raises:
        HTTPException: If rate limit exceeded
    """
    client_ip = extract_client_ip(request)

    allowed, usage_info = await rate_limiter.check_and_increment_usage(client_ip)

    if not allowed:
        raise _create_rate_limit_error_response(usage_info)

    logger.info(
        f"Rate limit check passed for IP {client_ip}: IP remaining={usage_info.ip_remaining}, Prefix remaining={usage_info.prefix_remaining}"
    )


async def count_message_with_rate_limit(
    request: Request, rate_limiter: DualLayerRateLimiter
) -> dict:
    """
    Count one message and check rate limits

    Args:
        request: HTTP request object
        rate_limiter: Rate limiter instance

    Returns:
        dict: Success response with remaining count

    Raises:
        HTTPException: If rate limit exceeded
    """
    client_ip = extract_client_ip(request)
    allowed, usage_info = await rate_limiter.increment_usage(client_ip, count=1)

    if not allowed:
        raise _create_rate_limit_error_response(usage_info)

    logger.info(
        f"Message counted for IP {client_ip}: {usage_info.ip_remaining} remaining"
    )
    return {
        "allowed": True,
        "remaining": usage_info.ip_remaining,
        "message": f"Message counted. {usage_info.ip_remaining} messages remaining today.",
    }
