import pytest
import os
from unittest.mock import MagicMock, patch
from src.modules.llm_completion import FireworksStreamer, StreamingStats
from dotenv import load_dotenv

load_dotenv()


@pytest.fixture
def api_key():
    """Get API key from environment or skip test if not available"""
    api_key = os.getenv("FIREWORKS_API_KEY")
    if not api_key:
        pytest.skip("FIREWORKS_API_KEY not set")
    return api_key


@pytest.fixture
def streamer(api_key):
    """Create FireworksStreamer instance"""
    return FireworksStreamer(api_key)


class MockLLMChunk:
    """Mock chunk with performance metrics"""

    def __init__(self, text="", finish_reason=None, perf_metrics=None):
        self.choices = [MockChoice(text, finish_reason)]
        self.perf_metrics = perf_metrics


class MockChoice:
    """Mock choice for completion"""

    def __init__(self, text="", finish_reason=None):
        self.text = text
        self.finish_reason = finish_reason
        self.delta = MockDelta(text)


class MockDelta:
    """Mock delta for chat completion"""

    def __init__(self, content=""):
        self.content = content


@pytest.mark.asyncio
async def test_performance_metrics_disabled_by_default(streamer):
    """Test that performance metrics are not enabled by default"""
    with patch.object(streamer, "_get_llm") as mock_get_llm:
        mock_llm = MagicMock()
        mock_completion = MagicMock()
        mock_llm.chat.completions.create = mock_completion
        mock_get_llm.return_value = mock_llm

        # Mock the async generator
        async def mock_generator():
            yield MockLLMChunk("Hello", "stop")

        with patch.object(
            streamer, "_async_generator_wrapper", return_value=mock_generator()
        ):
            chunks = []
            async for chunk in streamer.stream_chat_completion(
                model_key="qwen3_235b",
                messages=[{"role": "user", "content": "Hello"}],
                enable_perf_metrics=False,
            ):
                chunks.append(chunk)

        # Verify perf_metrics_in_response was not passed
        call_args = mock_completion.call_args
        assert "perf_metrics_in_response" not in call_args[1]


@pytest.mark.asyncio
async def test_performance_metrics_enabled_when_requested(streamer):
    """Test that performance metrics are enabled when requested"""
    with patch.object(streamer, "_get_llm") as mock_get_llm:
        mock_llm = MagicMock()
        mock_completion = MagicMock()
        mock_llm.chat.completions.create = mock_completion
        mock_get_llm.return_value = mock_llm

        # Mock the async generator
        async def mock_generator():
            yield MockLLMChunk("Hello", "stop")

        with patch.object(
            streamer, "_async_generator_wrapper", return_value=mock_generator()
        ):
            chunks = []
            async for chunk in streamer.stream_chat_completion(
                model_key="qwen3_235b",
                messages=[{"role": "user", "content": "Hello"}],
                enable_perf_metrics=True,
            ):
                chunks.append(chunk)

        # Verify perf_metrics_in_response was passed as True
        call_args = mock_completion.call_args
        assert call_args[1]["perf_metrics_in_response"] is True


@pytest.mark.asyncio
async def test_streaming_stats_update_from_fireworks_metrics():
    """Test that StreamingStats correctly updates from Fireworks metrics"""
    stats = StreamingStats(request_id="test", start_time=1000.0)

    # Mock Fireworks performance metrics
    perf_metrics = {
        "fireworks-server-time-to-first-token": 150,  # 150ms
        "fireworks-server-time": 2000,  # 2000ms
        "usage": {"prompt_tokens": 10, "completion_tokens": 25, "total_tokens": 35},
    }

    stats.update_from_fireworks_metrics(perf_metrics)

    # Verify metrics were extracted correctly
    assert stats.fireworks_metrics == perf_metrics
    assert stats.prompt_tokens == 10
    assert stats.completion_tokens == 25
    assert stats.total_tokens == 35
    assert stats.time_to_first_token == 0.150  # 150ms converted to seconds
    assert stats.server_processing_time == 2.0  # 2000ms converted to seconds


@pytest.mark.asyncio
async def test_streaming_stats_fallback_to_manual_metrics():
    """Test that StreamingStats falls back to manual metrics when SDK metrics unavailable"""
    import time

    start_time = time.time()
    stats = StreamingStats(request_id="test", start_time=start_time)

    # Simulate manual tracking (no Fireworks metrics)
    stats._manual_first_token_time = start_time + 0.1
    stats._manual_tokens_generated = 20
    stats._manual_characters_generated = 100

    # Verify fallback works
    assert abs(stats.time_to_first_token - 0.1) < 0.01  # Should be ~0.1 seconds
    assert stats.tokens_generated == 20
    assert stats.characters_generated == 100


@pytest.mark.asyncio
async def test_streaming_stats_prefers_sdk_metrics():
    """Test that StreamingStats prefers SDK metrics over manual tracking"""
    import time

    start_time = time.time()
    stats = StreamingStats(request_id="test", start_time=start_time)

    # Set manual tracking
    stats._manual_first_token_time = start_time + 0.2
    stats._manual_tokens_generated = 10

    # Set SDK metrics (should take precedence)
    perf_metrics = {
        "fireworks-server-time-to-first-token": 100,  # 100ms
        "usage": {"prompt_tokens": 5, "completion_tokens": 15, "total_tokens": 20},
    }
    stats.update_from_fireworks_metrics(perf_metrics)

    # Verify SDK metrics are preferred
    assert stats.time_to_first_token == 0.1  # 100ms from SDK, not 200ms from manual
    assert (
        stats.tokens_generated == 15
    )  # completion_tokens from SDK, not 10 from manual


@pytest.mark.asyncio
async def test_performance_metrics_extraction_with_callback(streamer):
    """Test that performance metrics are passed to callback when available"""
    collected_stats = []

    def stats_callback(text, stats):
        collected_stats.append((text, stats))

    with patch.object(streamer, "_get_llm") as mock_get_llm:
        mock_llm = MagicMock()
        mock_completion = MagicMock()
        mock_llm.chat.completions.create = mock_completion
        mock_get_llm.return_value = mock_llm

        # Mock the async generator with performance metrics in final chunk
        async def mock_generator():
            yield MockLLMChunk("Hello")
            yield MockLLMChunk(
                " World",
                "stop",
                {
                    "fireworks-server-time-to-first-token": 120,
                    "usage": {"completion_tokens": 2},
                },
            )

        with patch.object(
            streamer, "_async_generator_wrapper", return_value=mock_generator()
        ):
            chunks = []
            async for chunk in streamer.stream_chat_completion(
                model_key="qwen3_235b",
                messages=[{"role": "user", "content": "Hello"}],
                enable_perf_metrics=True,
                callback=stats_callback,
            ):
                chunks.append(chunk)

    # Verify callback was called and final stats have metrics
    assert len(collected_stats) == 2
    final_text, final_stats = collected_stats[-1]
    assert final_stats.fireworks_metrics is not None
    assert final_stats.completion_tokens == 2


if __name__ == "__main__":
    pytest.main([__file__])
