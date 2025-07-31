import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import Request
import redis.asyncio as redis

from src.modules.rate_limiter import DualLayerRateLimiter
from src.modules.auth import get_optional_api_key, extract_client_ip


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
        assert limiter.extract_ip_prefix("2001:db8:85a3:0:0:8a2e:370:7334") == "2001:db8:85a3:0"
        assert limiter.extract_ip_prefix("::1") == ":::"
        
        # Invalid IP fallback
        assert limiter.extract_ip_prefix("invalid.ip.address") == "invalid.ip"
        assert limiter.extract_ip_prefix("") == ""

    @pytest.mark.asyncio
    async def test_basic_rate_limiting(self):
        """Test basic rate limiting functionality"""
        # Mock Redis to avoid external dependency
        with patch('src.modules.rate_limiter.redis.from_url') as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            
            # Create a mock pipeline
            mock_pipeline = AsyncMock()
            mock_client.pipeline.return_value = mock_pipeline
            
            # Simulate empty Redis (no existing usage) - first call to get current usage
            mock_pipeline.execute.return_value = [None, None]
            
            limiter = DualLayerRateLimiter()
            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")
            
            assert allowed == True
            assert info["ip_usage"] == 1
            assert info["prefix_usage"] == 1
            assert info["limit_type"] == "allowed"

    @pytest.mark.asyncio
    async def test_ip_limit_exceeded(self):
        """Test individual IP limit exceeded"""
        with patch('src.modules.rate_limiter.redis.from_url') as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            
            # Create a mock pipeline
            mock_pipeline = AsyncMock()
            mock_client.pipeline.return_value = mock_pipeline
            
            # Simulate IP already at limit (5 uses)
            mock_pipeline.execute.return_value = ["5", "10"]
            
            limiter = DualLayerRateLimiter()
            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")
            
            assert allowed == False
            assert info["limit_type"] == "individual_ip"
            assert info["ip_usage"] == 5
            assert info["ip_limit"] == 5

    @pytest.mark.asyncio
    async def test_prefix_limit_exceeded(self):
        """Test IP prefix limit exceeded"""
        with patch('src.modules.rate_limiter.redis.from_url') as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            
            # Create a mock pipeline
            mock_pipeline = AsyncMock()
            mock_client.pipeline.return_value = mock_pipeline
            
            # Simulate prefix at limit (50 uses) but IP under limit
            mock_pipeline.execute.return_value = ["2", "50"]
            
            limiter = DualLayerRateLimiter()
            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")
            
            assert allowed == False
            assert info["limit_type"] == "ip_prefix"
            assert info["prefix_usage"] == 50
            assert info["prefix_limit"] == 50

    @pytest.mark.asyncio
    async def test_redis_failure_fail_open(self):
        """Test that Redis failures result in fail-open behavior"""
        with patch('redis.asyncio.from_url') as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            
            # Simulate Redis connection error
            mock_client.pipeline.return_value.execute = AsyncMock(side_effect=Exception("Redis connection failed"))
            
            limiter = DualLayerRateLimiter()
            allowed, info = await limiter.check_and_increment_usage("192.168.1.100")
            
            assert allowed == True  # Should fail open
            assert info["limit_type"] == "error_failopen"

    @pytest.mark.asyncio
    async def test_usage_info_without_increment(self):
        """Test getting usage info without incrementing counters"""
        with patch('src.modules.rate_limiter.redis.from_url') as mock_redis:
            mock_client = AsyncMock()
            mock_redis.return_value = mock_client
            
            # Create a mock pipeline
            mock_pipeline = AsyncMock()
            mock_client.pipeline.return_value = mock_pipeline
            
            # Simulate existing usage
            mock_pipeline.execute.return_value = ["3", "25"]
            
            limiter = DualLayerRateLimiter()
            info = await limiter.get_usage_info("192.168.1.100")
            
            assert info["ip_usage"] == 3
            assert info["prefix_usage"] == 25
            assert info["ip_remaining"] == 2  # 5 - 3
            assert info["prefix_remaining"] == 25  # 50 - 25


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
            "x-vercel-forwarded-for": "192.168.1.100, 10.0.0.1"
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


# Integration tests would go here
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
    # Run tests with: python -m pytest api/tests/test_rate_limiting.py -v
    pytest.main([__file__, "-v"]) 