import asyncio
import aiohttp
import json
import time
from typing import Optional
import argparse


class RateLimitTester:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def test_single_chat(self, api_key: Optional[str] = None, custom_headers: dict = None):
        """Test the /chat/single endpoint"""
        headers = {
            "Content-Type": "application/json",
        }
        
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        if custom_headers:
            headers.update(custom_headers)

        payload = {
            "model_key": "llama_8b",  # Using a lightweight model
            "messages": [
                {
                    "role": "user", 
                    "content": f"Hello! This is test request at {time.time()}"
                }
            ],
            "temperature": 0.7
        }

        try:
            async with self.session.post(
                f"{self.base_url}/chat/single",
                headers=headers,
                json=payload
            ) as response:
                result = {
                    "status_code": response.status,
                    "headers": dict(response.headers),
                    "url": str(response.url)
                }
                
                if response.status == 429:
                    result["error_detail"] = await response.text()
                elif response.status == 200:
                    # For streaming responses, just confirm it started
                    result["content_type"] = response.headers.get("content-type", "")
                    result["success"] = "text/event-stream" in result["content_type"]
                else:
                    result["response_text"] = await response.text()
                
                return result
        except Exception as e:
            return {"error": str(e), "status_code": None}

    async def run_rate_limit_test_sequence(self, test_count: int = 7):
        """Run a sequence of requests to test rate limiting"""
        print(f"🚀 Testing Rate Limiting with {test_count} requests")
        print("=" * 60)
        
        results = []
        
        for i in range(test_count):
            print(f"\n📡 Request {i+1}/{test_count}")
            
            result = await self.test_single_chat()
            results.append(result)
            
            print(f"   Status: {result['status_code']}")
            
            # Print rate limit headers if present
            for header_name, header_value in result.get('headers', {}).items():
                if 'ratelimit' in header_name.lower():
                    print(f"   {header_name}: {header_value}")
            
            if result['status_code'] == 429:
                print(f"   🚫 Rate Limited!")
                if 'error_detail' in result:
                    try:
                        error_data = json.loads(result['error_detail'])
                        print(f"   💬 Error: {error_data.get('detail', 'Unknown error')}")
                    except:
                        print(f"   💬 Error: {result['error_detail']}")
                        
            elif result['status_code'] == 200:
                print(f"   ✅ Success!")
                
            else:
                print(f"   ⚠️  Unexpected status: {result.get('response_text', 'No details')}")
                
            # Small delay between requests
            await asyncio.sleep(0.5)
        
        return results

    async def test_with_api_key(self, api_key: str):
        """Test that API key bypasses rate limiting"""
        print(f"\n🔑 Testing with API Key (should bypass rate limiting)")
        print("=" * 60)
        
        # Make several requests quickly
        for i in range(3):
            print(f"\n📡 API Key Request {i+1}/3")
            result = await self.test_single_chat(api_key=api_key)
            print(f"   Status: {result['status_code']}")
            
            if result['status_code'] == 200:
                print(f"   ✅ Success with API key!")
            else:
                print(f"   ⚠️  Issue: {result.get('response_text', 'No details')}")

    async def test_different_ips(self):
        """Test with different simulated IP addresses"""
        print(f"\n🌐 Testing with Different IP Addresses")
        print("=" * 60)
        
        test_ips = [
            "192.168.1.100",  # First IP
            "192.168.1.101",  # Same prefix  
            "10.0.0.1",       # Different prefix
        ]
        
        for ip in test_ips:
            print(f"\n📡 Testing from IP: {ip}")
            # Simulate different IPs using headers
            headers = {"X-Forwarded-For": ip}
            result = await self.test_single_chat(custom_headers=headers)
            print(f"   Status: {result['status_code']}")

    async def test_redis_connection(self):
        """Test if Redis is accessible"""
        print(f"\n🔄 Testing Redis Connection")
        print("=" * 60)
        
        try:
            import redis.asyncio as redis
            client = redis.from_url("redis://localhost:6379", decode_responses=True)
            
            # Test connection
            await client.ping()
            print("   ✅ Redis connection successful!")
            
            # Show some rate limiting keys if they exist
            keys = await client.keys("*usage*")
            if keys:
                print(f"   📊 Found {len(keys)} rate limiting keys:")
                for key in keys[:5]:  # Show first 5
                    value = await client.get(key)
                    print(f"      {key}: {value}")
            else:
                print("   📊 No rate limiting keys found (fresh start)")
                
            await client.close()
            
        except ImportError:
            print("   ⚠️  Redis library not available")
        except Exception as e:
            print(f"   ❌ Redis connection failed: {e}")


async def main():
    parser = argparse.ArgumentParser(description="Test Rate Limiting Manually")
    parser.add_argument("--url", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--api-key", help="Test with this API key")
    parser.add_argument("--requests", type=int, default=7, help="Number of requests to test")
    
    args = parser.parse_args()
    
    print("🧪 Manual Rate Limiting Test Suite")
    print("=" * 60)
    print(f"Target URL: {args.url}")
    print(f"Test requests: {args.requests}")
    
    async with RateLimitTester(args.url) as tester:
        # Test Redis connection first
        await tester.test_redis_connection()
        
        # Test rate limiting
        await tester.run_rate_limit_test_sequence(args.requests)
        
        # Test different IPs
        await tester.test_different_ips()
        
        # Test API key bypass if provided
        if args.api_key:
            await tester.test_with_api_key(args.api_key)
        else:
            print(f"\n💡 Tip: Use --api-key YOUR_KEY to test API key bypass")
    
    print(f"\n🎯 Manual Testing Complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main()) 