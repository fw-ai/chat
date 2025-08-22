import pytest
import os
from src.llm_inference.llm_completion import LLMStreamer
from dotenv import load_dotenv

load_dotenv()


@pytest.fixture
def api_key():
    """Get API key from environment or skip test if not available"""
    api_key = os.getenv("FIREWORKS_API_KEY")
    if not api_key:
        pytest.skip("FIREWORKS_API_KEY not set - skipping integration test")
    return api_key


@pytest.fixture
def streamer(api_key):
    """Create FireworksStreamer instance"""
    return LLMStreamer(api_key)


@pytest.mark.asyncio
async def test_real_performance_metrics_integration(streamer):
    """Integration test with real Fireworks API to verify performance metrics work"""
    collected_stats = []

    def stats_callback(text, stats):
        collected_stats.append(stats)

    # Test with performance metrics enabled
    chunks = []
    async for chunk in streamer.stream_chat_completion(
        model_key="qwen3-235b-a22b-instruct-2507",
        messages=[{"role": "user", "content": "Say 'hello' in exactly one word."}],
        enable_perf_metrics=True,
        callback=stats_callback,
    ):
        chunks.append(chunk)

    # Verify we got content
    assert len(chunks) > 0
    full_response = "".join(chunks)
    assert len(full_response.strip()) > 0

    # Verify stats were collected
    assert len(collected_stats) > 0
    final_stats = collected_stats[-1]

    # Check that we got Fireworks metrics (should be available in final chunk)
    # Note: This might not always be available depending on the response,
    # but we can at least verify the mechanism works
    print(f"Final stats completion tokens: {final_stats.completion_tokens}")
    print(f"Final stats fireworks metrics: {final_stats.fireworks_metrics}")
    print(f"Time to first token: {final_stats.time_to_first_token}")
    print(f"Tokens per second: {final_stats.tokens_per_second}")

    # Basic sanity checks
    assert final_stats.completion_text == full_response
    assert final_stats.total_time > 0

    # If Fireworks metrics are available, verify they're being used
    if final_stats.fireworks_metrics:
        # The metrics format from Fireworks includes keys like:
        # 'prompt-tokens', 'server-time-to-first-token', 'server-processing-time'
        assert "server-time-to-first-token" in final_stats.fireworks_metrics
        assert final_stats.time_to_first_token > 0  # Should use SDK metrics now
        print("✅ Fireworks SDK metrics successfully captured!")
        print(
            f"✅ Server TTFT: {final_stats.fireworks_metrics.get('server-time-to-first-token')}ms"
        )
        print(
            f"✅ Server processing time: {final_stats.fireworks_metrics.get('server-processing-time')}ms"
        )
    else:
        print(
            "ℹ️ Fireworks SDK metrics not available in this response (may vary by model/request)"
        )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_performance_metrics_comparison_scenario(streamer):
    """Test performance metrics in a comparison-like scenario"""

    # Simulate side-by-side comparison with two models
    model_keys = [
        "gpt-oss-120b",
        "qwen3-235b-a22b-instruct-2507",
    ]  # Same model for testing
    messages = [{"role": "user", "content": "Count from 1 to 3."}]

    results = []

    for i, model_key in enumerate(model_keys):
        collected_stats = []

        def stats_callback(text, stats):
            collected_stats.append(stats)

        chunks = []
        async for chunk in streamer.stream_chat_completion(
            model_key=model_key,
            messages=messages,
            request_id=f"comparison_test_{i}",
            enable_perf_metrics=True,
            callback=stats_callback,
        ):
            chunks.append(chunk)

        final_stats = collected_stats[-1] if collected_stats else None
        results.append(
            {
                "model_index": i,
                "model_key": model_key,
                "response": "".join(chunks),
                "stats": final_stats,
            }
        )

    # Verify both requests completed
    assert len(results) == 2

    for i, result in enumerate(results):
        print(f"Model {i} ({result['model_key']}):")
        print(f"  Response: {result['response'][:50]}...")
        print(f"  TTFT: {result['stats'].time_to_first_token:.3f}s")
        print(f"  TPS: {result['stats'].tokens_per_second:.2f}")
        print(
            f"  SDK metrics available: {result['stats'].fireworks_metrics is not None}"
        )

        # Verify basic functionality
        assert len(result["response"]) > 0
        assert result["stats"].total_time > 0


if __name__ == "__main__":
    # Run with: python -m pytest tests/test_performance_metrics_integration.py -v -m integration
    pytest.main([__file__, "-v", "-m", "integration"])
