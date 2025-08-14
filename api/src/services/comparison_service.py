import asyncio
from typing import Dict, List, AsyncGenerator, Any

from llm_inference.benchmark import FireworksBenchmarkService
from src.modules.session import SessionManager
from src.logger import logger


class MetricsStreamer:
    """Handles live metrics streaming for comparisons."""

    def __init__(self, client_api_key: str):
        self.client_api_key = client_api_key
        self.benchmark_service = FireworksBenchmarkService(client_api_key)

    async def stream_live_metrics(
        self,
        model_keys: List[str],
        prompt: str,
        concurrency: int = 1,
        temperature: float = 0.7,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream live metrics as they are generated."""

        try:
            # Create metrics queue for live streaming
            metrics_queue = asyncio.Queue()

            async def metrics_callback(metrics: Dict[str, Any]):
                await metrics_queue.put(metrics)

            # Start benchmark task
            benchmark_task = asyncio.create_task(
                self.benchmark_service.run_live_comparison_benchmark(
                    model_keys=model_keys,
                    prompt=prompt,
                    concurrency=concurrency,
                    max_tokens=100,
                    temperature=temperature,
                    live_metrics_callback=metrics_callback,
                )
            )

            # Stream metrics as they arrive
            while not benchmark_task.done():
                try:
                    metrics = await asyncio.wait_for(metrics_queue.get(), timeout=0.1)
                    yield {"type": "live_metrics", "metrics": metrics}
                except asyncio.TimeoutError:
                    continue

            # Drain remaining metrics
            while not metrics_queue.empty():
                try:
                    metrics = metrics_queue.get_nowait()
                    yield {"type": "live_metrics", "metrics": metrics}
                except asyncio.QueueEmpty:
                    break

            # Get final results
            benchmark_results = await benchmark_task

            if benchmark_results:
                yield {
                    "type": "speed_test_results",
                    "results": self._format_benchmark_results(
                        benchmark_results, model_keys, concurrency
                    ),
                }

        except Exception as e:
            logger.error(f"Error in metrics streaming: {str(e)}")
            yield {"type": "speed_test_error", "error": str(e)}

    def _format_benchmark_results(
        self, results: Dict[str, Any], model_keys: List[str], concurrency: int
    ) -> Dict[str, Any]:
        """Format benchmark results for frontend consumption."""
        model1_result = results[model_keys[0]]
        model2_result = results[model_keys[1]]

        return {
            "model1_tps": model1_result.avg_tokens_per_second,
            "model2_tps": model2_result.avg_tokens_per_second,
            "model1_rps": model1_result.requests_per_second,
            "model2_rps": model2_result.requests_per_second,
            "model1_ttft": model1_result.avg_time_to_first_token * 1000,
            "model2_ttft": model2_result.avg_time_to_first_token * 1000,
            "model1_times": [
                r.get("total_time", 0) * 1000
                for r in model1_result.individual_results
                if "total_time" in r
            ],
            "model2_times": [
                r.get("total_time", 0) * 1000
                for r in model2_result.individual_results
                if "total_time" in r
            ],
            "concurrency": concurrency,
            "model1_aggregate_tps": model1_result.aggregate_tokens_per_second,
            "model2_aggregate_tps": model2_result.aggregate_tokens_per_second,
            "model1_completed_requests": model1_result.successful_requests,
            "model2_completed_requests": model2_result.successful_requests,
            "total_requests": model1_result.total_requests,
            "model1_total_time": model1_result.total_time * 1000,
            "model2_total_time": model2_result.total_time * 1000,
        }


class ComparisonService:
    """Simple coordination service for comparisons - minimal and focused."""

    def __init__(self, session_manager: SessionManager):
        self.session_manager = session_manager

    def create_comparison_session(
        self,
        comparison_id: str,
        model_keys: List[str],
        initial_messages: List[Dict[str, Any]],
    ) -> None:
        """Create a lightweight comparison session for coordination."""
        # Simple coordination session - just tracks the comparison
        self.session_manager.get_or_create_session(
            session_id=comparison_id, model_keys=model_keys, session_type="compare"
        )

        # Store initial user message if present
        if initial_messages:
            latest_message = initial_messages[-1]
            if latest_message.get("role") == "user":
                self.session_manager.add_user_message(
                    comparison_id, latest_message.get("content", "")
                )

    def get_comparison_prompt(self, comparison_id: str) -> str:
        """Get the latest user message from comparison session."""
        try:
            session = self.session_manager.get_session(comparison_id)
            if session and session.conversation_history:
                user_messages = [
                    msg
                    for msg in session.conversation_history
                    if msg.get("role") == "user"
                ]
                return (
                    user_messages[-1]["content"] if user_messages else "Hello, world!"
                )
            else:
                return "Hello, world!"
        except Exception:
            return "Hello, world!"
