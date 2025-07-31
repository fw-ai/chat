import redis.asyncio as redis
from typing import Tuple, Dict, Optional, Union
import ipaddress
from datetime import datetime
import os
from src.logger import logger

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

    async def _get_usage_info(self, ip: str) -> Dict[str, Union[int, str, redis.Redis]]:
        """
        Get current usage without incrementing

        Returns:
            (ip_usage: int, prefix_usage: int, redis_client: redis.Redis)
        """
        redis_client = await self._get_redis()
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
            "redis_client": redis_client
        }

    @staticmethod
    def extract_ip_prefix(ip: str) -> str:
        """Extract first two octets: 192.168.1.100 -> 192.168"""
        try:
            # Validate IP format (handles both IPv4 and IPv6)
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.version == 4:
                octets = str(ip_obj).split('.')
                return f"{octets[0]}.{octets[1]}"
            else:
                # For IPv6, use exploded form to avoid compression issues
                exploded = ip_obj.exploded  # Full expanded form
                groups = exploded.split(':')[:4]
                return ':'.join(groups)
        except ValueError:
            # Fallback for invalid IPs - just truncate
            return ip[:10]

    async def check_and_increment_usage(self, ip: str) -> Tuple[bool, Dict[str, any]]:
        """
        Check both IP and prefix limits, increment if allowed
        
        Returns:
            (allowed: bool, usage_info: dict)
        """
        try:
            usage_info = await self._get_usage_info(ip)

            redis_client = usage_info["redis_client"]
            ip_key = usage_info["ip_key"]
            prefix_key = usage_info["prefix_key"]
            ip_usage = usage_info["ip_usage"]
            prefix_usage = usage_info["prefix_usage"]

            # Check limits
            if ip_usage >= self.IP_LIMIT:
                return False, {
                    "ip_usage": ip_usage,
                    "ip_limit": self.IP_LIMIT,
                    "prefix_usage": prefix_usage,
                    "prefix_limit": self.PREFIX_LIMIT,
                    "limit_type": "individual_ip"
                }

            if prefix_usage >= self.PREFIX_LIMIT:
                return False, {
                    "ip_usage": ip_usage,
                    "ip_limit": self.IP_LIMIT,
                    "prefix_usage": prefix_usage,
                    "prefix_limit": self.PREFIX_LIMIT,
                    "limit_type": "ip_prefix"
                }

            # Both limits OK - increment atomically
            pipe = redis_client.pipeline()
            pipe.incr(ip_key)
            pipe.expire(ip_key, 86400)  # 24 hours TTL
            pipe.incr(prefix_key)
            pipe.expire(prefix_key, 86400)  # 24 hours TTL
            await pipe.execute()

            return True, {
                "ip_usage": ip_usage + 1,
                "ip_limit": self.IP_LIMIT,
                "prefix_usage": prefix_usage + 1,
                "prefix_limit": self.PREFIX_LIMIT,
                "limit_type": "allowed"
            }

        except Exception as e:
            logger.error(f"Rate limiter error: {str(e)}")
            # Fail open - allow request if Redis is down
            return True, {
                "ip_usage": 0,
                "ip_limit": self.IP_LIMIT,
                "prefix_usage": 0,
                "prefix_limit": self.PREFIX_LIMIT,
                "limit_type": "error_failopen"
            }

    async def get_usage_info(self, ip: str) -> Dict[str, any]:
        """Get current usage without incrementing"""
        try:
            usage_info = await self._get_usage_info(ip)

            ip_usage = usage_info["ip_usage"]
            prefix_usage = usage_info["prefix_usage"]

            return {
                "ip_usage": ip_usage,
                "ip_limit": self.IP_LIMIT,
                "prefix_usage": prefix_usage,
                "prefix_limit": self.PREFIX_LIMIT,
                "ip_remaining": max(0, self.IP_LIMIT - ip_usage),
                "prefix_remaining": max(0, self.PREFIX_LIMIT - prefix_usage)
            }
        except Exception as e:
            logger.error(f"Error getting usage info: {str(e)}")
            return {
                "ip_usage": 0,
                "ip_limit": self.IP_LIMIT,
                "prefix_usage": 0,
                "prefix_limit": self.PREFIX_LIMIT,
                "ip_remaining": self.IP_LIMIT,
                "prefix_remaining": self.PREFIX_LIMIT
            } 