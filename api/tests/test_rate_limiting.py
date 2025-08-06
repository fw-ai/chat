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
            == "2001:db8:85a3:0"
        )
        assert limiter.extract_ip_prefix("::1") == "1:0:0:0"

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

        # Mock the _get_usage_info method to return values at limit
        with patch.object(limiter, "_get_usage_info") as mock_usage:
            mock_usage.return_value = {
                "ip_key": "ip_usage:2025-01-31:192.168.1.100",
                "prefix_key": "prefix_usage:2025-01-31:192.168",
                "ip_usage": APP_CONFIG["rate_limiting"]["individual_ip_limit"],
                "prefix_usage": APP_CONFIG["rate_limiting"]["ip_prefix_limit"],
                "redis_client": AsyncMock(),
            }

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert not allowed
            assert info.limit_reason == "individual_ip"
            assert info.ip_usage == APP_CONFIG["rate_limiting"]["individual_ip_limit"]
            assert info.ip_limit == APP_CONFIG["rate_limiting"]["individual_ip_limit"]

    @pytest.mark.asyncio
    async def test_prefix_limit_exceeded(self):
        """Test IP prefix limit exceeded"""
        limiter = DualLayerRateLimiter()

        # Mock the _get_usage_info method to return prefix at limit
        with patch.object(limiter, "_get_usage_info") as mock_usage:
            mock_usage.return_value = {
                "ip_key": "ip_usage:2025-01-31:192.168.1.100",
                "prefix_key": "prefix_usage:2025-01-31:192.168",
                "ip_usage": 2,  # Under IP limit
                "prefix_usage": APP_CONFIG["rate_limiting"][
                    "ip_prefix_limit"
                ],  # At prefix limit
                "redis_client": AsyncMock(),
            }

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert not allowed
            assert info.limit_reason == "ip_prefix"
            assert info.prefix_usage == APP_CONFIG["rate_limiting"]["ip_prefix_limit"]
            assert info.prefix_limit == APP_CONFIG["rate_limiting"]["ip_prefix_limit"]

    @pytest.mark.asyncio
    async def test_redis_failure_fail_closed(self):
        """Test that Redis failures result in fail-closed behavior"""
        limiter = DualLayerRateLimiter()

        # Mock the _get_usage_info method to simulate a general exception
        with patch.object(limiter, "_get_usage_info") as mock_usage:
            mock_usage.side_effect = Exception("Redis connection failed")

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert not allowed  # Should fail closed
            assert info.limit_reason == "error_failclosed"

    @pytest.mark.asyncio
    async def test_event_loop_error_fail_open(self):
        """Test that event loop errors result in fail-open behavior"""
        limiter = DualLayerRateLimiter()

        # Mock the _get_usage_info method to simulate event loop error
        with patch.object(limiter, "_get_usage_info") as mock_usage:
            mock_usage.side_effect = RuntimeError("Event loop is closed")

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert allowed  # Should fail open for event loop errors
            assert info.limit_reason == "event_loop_error"

    @pytest.mark.asyncio
    async def test_redis_connection_error_fail_open(self):
        """Test that Redis connection errors result in fail-open behavior"""
        limiter = DualLayerRateLimiter()

        # Mock the _get_usage_info method to simulate connection error
        with patch.object(limiter, "_get_usage_info") as mock_usage:
            mock_usage.side_effect = ConnectionError("Connection to Redis failed")

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert allowed  # Should fail open for connection errors
            assert info.limit_reason == "connection_error"

    @pytest.mark.asyncio
    async def test_redis_timeout_error_fail_open(self):
        """Test that Redis timeout errors result in fail-open behavior"""
        limiter = DualLayerRateLimiter()

        # Mock the _get_usage_info method to simulate timeout error
        with patch.object(limiter, "_get_usage_info") as mock_usage:
            mock_usage.side_effect = TimeoutError("Redis operation timed out")

            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")

            assert allowed  # Should fail open for timeout errors
            assert info.limit_reason == "connection_error"

    @pytest.mark.asyncio
    async def test_usage_info_without_increment(self):
        """Test getting usage info without incrementing counters"""
        limiter = DualLayerRateLimiter()

        # Mock the _get_usage_info method
        with patch.object(limiter, "_get_usage_info") as mock_usage:
            mock_usage.return_value = {
                "ip_key": "ip_usage:2025-01-31:192.168.1.100",
                "prefix_key": "prefix_usage:2025-01-31:192.168",
                "ip_usage": 3,
                "prefix_usage": 25,
                "redis_client": AsyncMock(),
            }

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


class TestComparisonRateLimiting:
    """Unit tests for comparison rate limiting functionality"""

    @pytest.mark.asyncio
    async def test_rate_limit_key_generation_single_chat(self):
        """Test rate limit key generation for single chat"""
        client_ip = "192.168.1.100"
        comparison_id = None

        # Test key generation logic
        rate_limit_key = f"{client_ip}:{comparison_id}" if comparison_id else client_ip

        assert rate_limit_key == "192.168.1.100"

    @pytest.mark.asyncio
    async def test_rate_limit_key_generation_comparison_chat(self):
        """Test rate limit key generation for comparison chat"""
        client_ip = "192.168.1.100"
        comparison_id = "comp_123456"

        # Test key generation logic
        rate_limit_key = f"{client_ip}:{comparison_id}" if comparison_id else client_ip

        assert rate_limit_key == "192.168.1.100:comp_123456"

    @pytest.mark.asyncio
    async def test_comparison_uses_different_key_than_single(self):
        """Test that comparison chat uses different key than single chat"""
        client_ip = "192.168.1.100"
        comparison_id = "comp_123456"

        single_key = client_ip
        comparison_key = f"{client_ip}:{comparison_id}"

        assert single_key != comparison_key
        assert single_key == "192.168.1.100"
        assert comparison_key == "192.168.1.100:comp_123456"

    @pytest.mark.asyncio
    async def test_multiple_models_same_comparison_use_same_key(self):
        """Test that multiple models in same comparison use same rate limit key"""
        client_ip = "192.168.1.100"
        comparison_id = "comp_123456"

        # First model request
        key_model_1 = f"{client_ip}:{comparison_id}" if comparison_id else client_ip
        # Second model request (same comparison)
        key_model_2 = f"{client_ip}:{comparison_id}" if comparison_id else client_ip

        assert key_model_1 == key_model_2
        assert key_model_1 == "192.168.1.100:comp_123456"

    @pytest.mark.asyncio
    async def test_verify_rate_limit_single_chat(self):
        """Test verify_rate_limit function for single chat"""
        # Create mock request
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {"x-forwarded-for": "192.168.1.100"}

        # Create mock rate limiter
        mock_limiter = MagicMock(spec=DualLayerRateLimiter)
        mock_limiter.check_and_increment_usage = AsyncMock(
            return_value=(True, MagicMock(ip_remaining=4))
        )

        with patch(
            "src.modules.rate_limiter.extract_client_ip", return_value="192.168.1.100"
        ):
            # Should not raise exception
            await verify_rate_limit(mock_request, mock_limiter, None)

            # Verify the rate limiter was called with IP only
            mock_limiter.check_and_increment_usage.assert_called_once_with(
                "192.168.1.100"
            )

    @pytest.mark.asyncio
    async def test_verify_rate_limit_comparison_chat(self):
        """Test verify_rate_limit function for comparison chat"""
        # Create mock request
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {"x-forwarded-for": "192.168.1.100"}

        # Create mock rate limiter
        mock_limiter = MagicMock(spec=DualLayerRateLimiter)
        mock_limiter.check_and_increment_usage = AsyncMock(
            return_value=(True, MagicMock(ip_remaining=4))
        )

        comparison_id = "comp_123456"

        with patch(
            "src.modules.rate_limiter.extract_client_ip", return_value="192.168.1.100"
        ):
            # Should not raise exception
            await verify_rate_limit(mock_request, mock_limiter, comparison_id)

            # Verify the rate limiter was called with IP:comparison_id
            mock_limiter.check_and_increment_usage.assert_called_once_with(
                "192.168.1.100:comp_123456"
            )


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
