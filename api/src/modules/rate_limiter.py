import redis.asyncio as redis
from typing import Tuple, Dict, Optional, Union
import ipaddress
from datetime import datetime
import os
from dataclasses import dataclass
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
        self.redis: Optional[redis.Redis] = None
        self.IP_LIMIT = int(os.getenv("RATE_LIMIT_IP", "5"))
        self.PREFIX_LIMIT = int(os.getenv("RATE_LIMIT_PREFIX", "50"))

    async def _get_redis(self) -> redis.Redis:
        """Get Redis connection with lazy initialization"""
        if self.redis is None:
            self.redis = redis.from_url(self.redis_url, decode_responses=True)
        return self.redis

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
        try:
            redis_client = await self._get_redis()
            usage_info = await self._get_usage_info(ip=ip, redis_client=redis_client)

            ip_key = usage_info["ip_key"]
            prefix_key = usage_info["prefix_key"]
            ip_usage = usage_info["ip_usage"]
            prefix_usage = usage_info["prefix_usage"]

            # Check limits
            if ip_usage >= self.IP_LIMIT:
                return False, RateLimitInfo(
                    ip_usage=ip_usage,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=prefix_usage,
                    prefix_limit=self.PREFIX_LIMIT,
                    limit_reason="individual_ip",
                )

            if prefix_usage >= self.PREFIX_LIMIT:
                return False, RateLimitInfo(
                    ip_usage=ip_usage,
                    ip_limit=self.IP_LIMIT,
                    prefix_usage=prefix_usage,
                    prefix_limit=self.PREFIX_LIMIT,
                    limit_reason="ip_prefix",
                )

            pipe = redis_client.pipeline()
            pipe.incr(ip_key)
            pipe.expire(ip_key, 86400)  # 24 hours TTL
            pipe.incr(prefix_key)
            pipe.expire(prefix_key, 86400)  # 24 hours TTL
            await pipe.execute()

            return True, RateLimitInfo(
                ip_usage=ip_usage + 1,
                ip_limit=self.IP_LIMIT,
                prefix_usage=prefix_usage + 1,
                prefix_limit=self.PREFIX_LIMIT,
                limit_reason="",
            )

        except Exception as e:
            logger.error(f"Rate limiter error: {str(e)}")
            # Fail open - allow request if Redis is down
            return True, RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
                limit_reason="error_failopen",
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
        except Exception as e:
            logger.error(f"Error getting usage info: {str(e)}")
            return RateLimitInfo(
                ip_usage=0,
                ip_limit=self.IP_LIMIT,
                prefix_usage=0,
                prefix_limit=self.PREFIX_LIMIT,
            )


async def verify_rate_limit(http_request: Request, rate_limiter: DualLayerRateLimiter):
    """
    Verify rate limit

    Args:
        http_request (Request): HTTP request object
        rate_limiter (RateLimiter): Rate limiter instance

    Returns:
        HTTPException: HTTPException if rate limit exceeded
    """
    client_ip = extract_client_ip(http_request)
    allowed, usage_info = await rate_limiter.check_and_increment_usage(client_ip)

    if not allowed:
        if usage_info.limit_reason == "individual_ip":
            detail = (
                f"Daily limit exceeded: "
                f"{usage_info.ip_limit} messages per IP address. "
                f"Sign in with a Fireworks API key for unlimited access."
            )
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
