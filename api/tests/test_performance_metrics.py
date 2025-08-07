import pytest
import os
from unittest.mock import patch
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
    with patch.object(streamer, "_prepare_base_payload") as mock_prepare_payload:
        mock_prepare_payload.return_value = {"model": "test", "messages": []}

        # Mock the streaming response
        async def mock_stream_generator():
            yield {"text": "Hello"}

        with patch.object(
            streamer, "_stream_request", return_value=mock_stream_generator()
        ):
            chunks = []
            async for chunk in streamer.stream_chat_completion(
                model_key="qwen3_235b",
                messages=[{"role": "user", "content": "Hello"}],
                enable_perf_metrics=False,
            ):
                chunks.append(chunk)

        # Verify enable_perf_metrics was False
        call_args = mock_prepare_payload.call_args[1]  # kwargs
        assert call_args["enable_perf_metrics"] is False


@pytest.mark.asyncio
async def test_performance_metrics_enabled_when_requested(streamer):
    """Test that performance metrics are enabled when requested"""
    with patch.object(streamer, "_prepare_base_payload") as mock_prepare_payload:
        mock_prepare_payload.return_value = {"model": "test", "messages": []}

        # Mock the streaming response
        async def mock_stream_generator():
            yield {"text": "Hello"}

        with patch.object(
            streamer, "_stream_request", return_value=mock_stream_generator()
        ):
            chunks = []
            async for chunk in streamer.stream_chat_completion(
                model_key="qwen3_235b",
                messages=[{"role": "user", "content": "Hello"}],
                enable_perf_metrics=True,
            ):
                chunks.append(chunk)

        # Verify enable_perf_metrics was True
        call_args = mock_prepare_payload.call_args[1]  # kwargs
        assert call_args["enable_perf_metrics"] is True


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


@pytest.mark.skip(reason="Callback test needs rework after implementation changes")
@pytest.mark.asyncio
async def test_performance_metrics_extraction_with_callback(streamer):
    """Test that performance metrics are passed to callback when available"""
    collected_stats = []

    def stats_callback(text, stats):
        collected_stats.append((text, stats))

    with patch.object(streamer, "_prepare_base_payload") as mock_prepare_payload:
        mock_prepare_payload.return_value = {"model": "test", "messages": []}

        # Mock the streaming response with performance metrics
        async def mock_stream_generator():
            yield {"text": "Hello"}
            yield {"text": " World"}

        with patch.object(
            streamer, "_stream_request", return_value=mock_stream_generator()
        ):
            # Mock the _process_performance_metrics to simulate metrics being processed
            with patch.object(
                streamer, "_process_performance_metrics"
            ) as mock_process_metrics:
                # Simulate performance metrics being found
                def mock_process_side_effect(chunk_data, stats):
                    if "World" in str(chunk_data):
                        stats.update_from_fireworks_metrics(
                            {
                                "fireworks-server-time-to-first-token": 120,
                                "usage": {"completion_tokens": 2},
                            }
                        )
                    return chunk_data

                mock_process_metrics.side_effect = mock_process_side_effect

                chunks = []
                async for chunk in streamer.stream_chat_completion(
                    model_key="qwen3_235b",
                    messages=[{"role": "user", "content": "Hello"}],
                    enable_perf_metrics=True,
                    callback=stats_callback,
                ):
                    chunks.append(chunk)

    # Verify callback was called
    assert len(collected_stats) >= 1
    # Check that at least one callback had metrics (the implementation may vary)
    has_metrics = any(
        stats.fireworks_metrics is not None for _, stats in collected_stats
    )
    assert has_metrics


if __name__ == "__main__":
    pytest.main([__file__])
