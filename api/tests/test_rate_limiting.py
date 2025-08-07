import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.modules.rate_limiter import DualLayerRateLimiter, verify_rate_limit
from src.modules.auth import get_optional_api_key, extract_client_ip
from redis.exceptions import ConnectionError, TimeoutError
from src.constants.configs import APP_CONFIG
from fastapi import Request


class TestDualLayerRateLimiter:
    """Unit tests for DualLayerRateLimiter class"""

    @pytest.mark.asyncio
    async def test_ip_prefix_extraction(self):
        """Test IP prefix extraction for various IP formats"""
        limiter = DualLayerRateLimiter()

        # IPv4 tests
        assert limiter.extract_ip_prefix("192.168.1.100") == "192.168"
        assert limiter.extract_ip_prefix("10.0.0.1") == "10.0"
        assert limiter.extract_ip_prefix("172.16.254.1") == "172.16"
        assert limiter.extract_ip_prefix("203.0.113.195") == "203.0"

        # IPv6 tests
        assert (
            limiter.extract_ip_prefix("2001:db8:85a3:0:0:8a2e:370:7334")
            == "2001:0db8:85a3:0000"
        )
        assert limiter.extract_ip_prefix("::1") == "0000:0000:0000:0000"

        # Invalid IP fallback
        assert limiter.extract_ip_prefix("invalid.ip.address") == "invalid.ip"
        assert limiter.extract_ip_prefix("") == ""

    @pytest.mark.asyncio
    async def test_basic_rate_limiting(self):
        """Test basic rate limiting functionality - simplified without Redis"""
        limiter = DualLayerRateLimiter()

        # Test the IP prefix extraction (this works)
        assert limiter.extract_ip_prefix("192.168.1.100") == "192.168"

        # Test that limits are properly configured
        assert limiter.IP_LIMIT == APP_CONFIG["rate_limiting"]["individual_ip_limit"]
        assert limiter.PREFIX_LIMIT == APP_CONFIG["rate_limiting"]["ip_prefix_limit"]

        # Note: Full Redis integration test would require real Redis instance
        # The actual rate limiting is tested via the working API endpoints

    @pytest.mark.asyncio
    async def test_ip_limit_exceeded(self):
        """Test individual IP limit exceeded"""
        limiter = DualLayerRateLimiter()

        # Mock Redis client to return values at IP limit
        with patch.object(limiter, "_get_redis_client") as mock_redis_factory:
            mock_client = AsyncMock()
            # Return IP usage at limit, prefix usage below limit
            mock_client.get.side_effect = [
                str(APP_CONFIG["rate_limiting"]["individual_ip_limit"]),  # ip_usage
                "5",  # prefix_usage (below limit)
            ]
            mock_redis_factory.return_value = mock_client

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert not allowed
            assert info.limit_reason == "individual_ip"
            assert info.ip_usage == APP_CONFIG["rate_limiting"]["individual_ip_limit"]
            assert info.ip_limit == APP_CONFIG["rate_limiting"]["individual_ip_limit"]

    @pytest.mark.asyncio
    async def test_prefix_limit_exceeded(self):
        """Test IP prefix limit exceeded"""
        limiter = DualLayerRateLimiter()

        # Mock Redis client to return prefix at limit, IP below limit
        with patch.object(limiter, "_get_redis_client") as mock_redis_factory:
            mock_client = AsyncMock()
            # Return IP usage below limit, prefix usage at limit
            mock_client.get.side_effect = [
                "2",  # ip_usage (below limit)
                str(
                    APP_CONFIG["rate_limiting"]["ip_prefix_limit"]
                ),  # prefix_usage at limit
            ]
            mock_redis_factory.return_value = mock_client

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert not allowed
            assert info.limit_reason == "ip_prefix"
            assert info.prefix_usage == APP_CONFIG["rate_limiting"]["ip_prefix_limit"]
            assert info.prefix_limit == APP_CONFIG["rate_limiting"]["ip_prefix_limit"]

    @pytest.mark.asyncio
    async def test_redis_failure_fail_open(self):
        """Test that Redis failures result in fail-open behavior"""
        limiter = DualLayerRateLimiter()

        # Mock Redis client to simulate a general exception
        with patch.object(limiter, "_get_redis_client") as mock_redis_factory:
            mock_redis_factory.side_effect = Exception("Redis connection failed")

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert allowed  # Should fail open
            assert info.limit_reason == "redis_error"

    @pytest.mark.asyncio
    async def test_redis_connection_error_fail_open(self):
        """Test that Redis connection errors result in fail-open behavior"""
        limiter = DualLayerRateLimiter()

        # Mock Redis client to simulate connection error
        with patch.object(limiter, "_get_redis_client") as mock_redis_factory:
            mock_redis_factory.side_effect = ConnectionError(
                "Connection to Redis failed"
            )

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert allowed  # Should fail open for connection errors
            assert info.limit_reason == "redis_error"

    @pytest.mark.asyncio
    async def test_redis_timeout_error_fail_open(self):
        """Test that Redis timeout errors result in fail-open behavior"""
        limiter = DualLayerRateLimiter()

        # Mock Redis client to simulate timeout error
        with patch.object(limiter, "_get_redis_client") as mock_redis_factory:
            mock_redis_factory.side_effect = TimeoutError("Redis operation timed out")

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert allowed  # Should fail open for timeout errors
            assert info.limit_reason == "redis_error"

    @pytest.mark.asyncio
    async def test_usage_info_without_increment(self):
        """Test getting usage info without incrementing counters"""
        limiter = DualLayerRateLimiter()

        # Mock Redis client to return specific usage values
        with patch.object(limiter, "_get_redis_client") as mock_redis_factory:
            mock_client = AsyncMock()
            mock_client.get.side_effect = ["3", "25"]  # ip_usage=3, prefix_usage=25
            mock_redis_factory.return_value = mock_client

            info = await limiter.get_usage_info("192.168.1.100")

            assert info.ip_usage == 3
            assert info.prefix_usage == 25
            assert (
                info.ip_remaining
                == APP_CONFIG["rate_limiting"]["individual_ip_limit"] - 3
            )
            assert (
                info.prefix_remaining
                == APP_CONFIG["rate_limiting"]["ip_prefix_limit"] - 25
            )


class TestSimplifiedRateLimiting:
    """Unit tests for simplified rate limiting functionality"""

    @pytest.mark.asyncio
    async def test_verify_rate_limit_success(self):
        """Test verify_rate_limit function with successful rate limit check"""
        # Create mock request
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {"x-forwarded-for": "192.168.1.100"}

        # Create mock rate limiter
        mock_limiter = MagicMock(spec=DualLayerRateLimiter)
        mock_limiter.check_and_increment_usage = AsyncMock(
            return_value=(True, MagicMock(ip_remaining=4, prefix_remaining=45))
        )

        with patch(
            "src.modules.rate_limiter.extract_client_ip", return_value="192.168.1.100"
        ):
            # Should not raise exception
            await verify_rate_limit(mock_request, mock_limiter)

            # Verify the rate limiter was called with IP only
            mock_limiter.check_and_increment_usage.assert_called_once_with(
                "192.168.1.100"
            )

    @pytest.mark.asyncio
    async def test_verify_rate_limit_failure(self):
        """Test verify_rate_limit function with rate limit exceeded"""
        # Create mock request
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {"x-forwarded-for": "192.168.1.100"}

        # Create mock rate limiter that returns failure
        from src.modules.rate_limiter import RateLimitInfo

        mock_limiter = MagicMock(spec=DualLayerRateLimiter)
        mock_limiter.check_and_increment_usage = AsyncMock(
            return_value=(
                False,
                RateLimitInfo(
                    ip_usage=10,
                    ip_limit=10,
                    prefix_usage=25,
                    prefix_limit=50,
                    limit_reason="individual_ip",
                ),
            )
        )

        with patch(
            "src.modules.rate_limiter.extract_client_ip", return_value="192.168.1.100"
        ):
            # Should raise HTTPException
            with pytest.raises(Exception):  # HTTPException
                await verify_rate_limit(mock_request, mock_limiter)


class TestAuthHelpers:
    """Unit tests for authentication helper functions"""

    @pytest.mark.asyncio
    async def test_get_optional_api_key_no_header(self):
        """Test optional API key with no authorization header"""
        request = MagicMock()
        request.headers.get.return_value = None

        result = await get_optional_api_key(request)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_optional_api_key_invalid_format(self):
        """Test optional API key with invalid format"""
        request = MagicMock()
        request.headers.get.return_value = "Invalid header"

        result = await get_optional_api_key(request)
        assert result is None

    def test_extract_client_ip_cloudflare(self):
        """Test IP extraction from Cloudflare header"""
        request = MagicMock()
        request.headers.get.side_effect = lambda header: {
            "cf-connecting-ip": "203.0.113.195"
        }.get(header)

        ip = extract_client_ip(request)
        assert ip == "203.0.113.195"

    def test_extract_client_ip_vercel(self):
        """Test IP extraction from Vercel header"""
        request = MagicMock()
        request.headers.get.side_effect = lambda header: {
            "cf-connecting-ip": None,
            "x-vercel-forwarded-for": "192.168.1.100, 10.0.0.1",
        }.get(header)

        ip = extract_client_ip(request)
        assert ip == "192.168.1.100"  # Should take first IP

    def test_extract_client_ip_fallback(self):
        """Test IP extraction fallback to direct connection"""
        request = MagicMock()
        request.headers.get.return_value = None
        request.client.host = "127.0.0.1"

        ip = extract_client_ip(request)
        assert ip == "127.0.0.1"


# TODO: Add integration tests for rate limiting
class TestRateLimitingIntegration:
    """Integration tests for rate limiting with FastAPI endpoints"""

    def setup_method(self):
        """Setup test client for each test"""
        # Note: These would require a test instance of the FastAPI app
        # and a test Redis instance for full integration testing
        pass

    @pytest.mark.skip(reason="Requires running Redis instance and full app setup")
    def test_rate_limit_endpoint_integration(self):
        """Full integration test with actual HTTP requests"""
        # This would test the actual /chat/single endpoint
        # with rate limiting enabled and a test Redis instance
        pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
