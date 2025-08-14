import time
import json
import asyncio
from typing import Dict, List, Optional, Any, Callable, Awaitable
from dataclasses import dataclass, asdict
from src.llm_inference.llm_completion import (
    FireworksBenchmark,
    FireworksConfig,
    DEFAULT_TEMPERATURE,
)
from src.logger import logger


@dataclass
class BenchmarkRequest:
    """Request configuration for benchmark"""

    model_key: str
    prompt: str
    concurrency: int = 10
    max_tokens: int = 256
    temperature: float = DEFAULT_TEMPERATURE
    test_duration: Optional[int] = None  # seconds


@dataclass
class BenchmarkResult:
    """Detailed benchmark results"""

    model_name: str
    model_id: str
    concurrency: int
    prompt: str

    # Timing metrics
    total_time: float
    avg_time_to_first_token: float

    # Throughput metrics
    avg_tokens_per_second: float
    aggregate_tokens_per_second: float
    peak_tokens_per_second: float

    # Success metrics
    total_requests: int
    successful_requests: int
    error_rate: float

    # Token metrics
    total_tokens_generated: int
    avg_tokens_per_request: float

    # Quality metrics
    sample_completion: str
    completion_lengths: List[int]

    # Raw data
    individual_results: List[Dict[str, Any]]
    error_messages: List[str]

    # Metadata
    timestamp: float
    config_used: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)

    @property
    def success_rate(self) -> float:
        """Success rate as percentage"""
        return (1.0 - self.error_rate) * 100

    @property
    def avg_completion_length(self) -> float:
        """Average completion length in characters"""
        if self.completion_lengths:
            return sum(self.completion_lengths) / len(self.completion_lengths)
        return 0

    @property
    def requests_per_second(self) -> float:
        """Actual requests per second (successful requests / total time)"""
        if self.total_time > 0:
            return self.successful_requests / self.total_time
        return 0


class FireworksBenchmarkService:
    """Service for running comprehensive Fireworks benchmarks"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.config = FireworksConfig()
        self.benchmark = FireworksBenchmark(api_key)

    async def run_single_benchmark(
        self,
        request: BenchmarkRequest,
        progress_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ) -> BenchmarkResult:
        """
        Run a single benchmark test

        Args:
            request: Benchmark configuration
            progress_callback: Optional callback for progress updates

        Returns:
            BenchmarkResult with comprehensive metrics
        """
        model_config = self.config.get_model(request.model_key)
        start_time = time.time()

        if progress_callback:
            progress_callback(
                "starting",
                {
                    "model": model_config["name"],
                    "concurrency": request.concurrency,
                    "status": "Initializing benchmark...",
                },
            )

        try:
            # Run the concurrent benchmark
            raw_results = await self.benchmark.run_concurrent_benchmark(
                model_key=request.model_key,
                prompt=request.prompt,
                concurrency=request.concurrency,
                temperature=request.temperature,
            )

            # Extract individual results and calculate advanced metrics
            individual_results = raw_results.get("individual_results", [])
            successful_results = [
                r for r in individual_results if r.get("tokens", 0) > 0
            ]
            error_results = [r for r in individual_results if "error" in r]

            # Calculate peak TPS
            peak_tps = (
                max([r.get("tps", 0) for r in successful_results])
                if successful_results
                else 0
            )

            # Calculate completion lengths
            completion_lengths = [
                len(r.get("completion_text", "")) for r in successful_results
            ]

            # Extract error messages
            error_messages = [r.get("error", "") for r in error_results]

            # Calculate average tokens per request
            avg_tokens_per_request = (
                sum(r.get("tokens", 0) for r in successful_results)
                / len(successful_results)
                if successful_results
                else 0
            )

            result = BenchmarkResult(
                model_name=model_config["name"],
                model_id=model_config["id"],
                concurrency=request.concurrency,
                prompt=request.prompt,
                total_time=raw_results["total_time"],
                avg_time_to_first_token=raw_results["avg_time_to_first_token"],
                avg_tokens_per_second=raw_results["avg_tokens_per_second"],
                aggregate_tokens_per_second=raw_results["aggregate_tokens_per_second"],
                peak_tokens_per_second=peak_tps,
                total_requests=raw_results["total_requests"],
                successful_requests=raw_results["successful_requests"],
                error_rate=raw_results["error_rate"],
                total_tokens_generated=raw_results["total_tokens"],
                avg_tokens_per_request=avg_tokens_per_request,
                sample_completion=raw_results.get("sample_completion", ""),
                completion_lengths=completion_lengths,
                individual_results=individual_results,
                error_messages=error_messages,
                timestamp=start_time,
                config_used={
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "model_config": model_config,
                },
            )

            if progress_callback:
                progress_callback(
                    "completed",
                    {
                        "model": model_config["name"],
                        "results": result.to_dict(),
                        "status": "Benchmark completed successfully",
                    },
                )

            return result

        except Exception as e:
            error_msg = f"Benchmark failed: {str(e)}"
            logger.error(error_msg)

            if progress_callback:
                progress_callback(
                    "error",
                    {
                        "model": model_config["name"],
                        "error": error_msg,
                        "status": "Benchmark failed",
                    },
                )

            return BenchmarkResult(
                model_name=model_config["name"],
                model_id=model_config["id"],
                concurrency=request.concurrency,
                prompt=request.prompt,
                total_time=time.time() - start_time,
                avg_time_to_first_token=0,
                avg_tokens_per_second=0,
                aggregate_tokens_per_second=0,
                peak_tokens_per_second=0,
                total_requests=request.concurrency,
                successful_requests=0,
                error_rate=1.0,
                total_tokens_generated=0,
                avg_tokens_per_request=0,
                sample_completion="",
                completion_lengths=[],
                individual_results=[],
                error_messages=[error_msg],
                timestamp=start_time,
                config_used={
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "model_config": model_config,
                },
            )

    async def run_live_comparison_benchmark(
        self,
        model_keys: List[str],
        prompt: str,
        concurrency: int = 10,
        max_tokens: int = 256,
        temperature: float = DEFAULT_TEMPERATURE,
        live_metrics_callback: Optional[
            Callable[[Dict[str, Any]], Awaitable[None]]
        ] = None,
    ) -> Dict[str, BenchmarkResult]:
        """
        Run benchmark comparison with live metrics streaming

        Args:
            model_keys: List of model keys to compare
            prompt: Test prompt
            concurrency: Number of concurrent requests per model
            temperature: Sampling temperature
            live_metrics_callback: Callback for live metrics updates

        Returns:
            Dictionary mapping model keys to their benchmark results
        """
        results = {}
        live_metrics = {
            "model1_completed_requests": 0,
            "model2_completed_requests": 0,
            "total_requests": concurrency,
            "model1_live_tps": 0,
            "model2_live_tps": 0,
            "model1_live_ttft": 0,
            "model2_live_ttft": 0,
            "model1_live_rps": 0,
            "model2_live_rps": 0,
            "model1_total_time": 0,
            "model2_total_time": 0,
        }

        # Track benchmark start times for each model
        benchmark_start_times = {0: None, 1: None}

        # Track last update times for throttling intermediate metrics
        last_intermediate_update = {0: 0, 1: 0}

        async def model_progress_callback(
            model_index: int, completed: int, metrics: Dict[str, Any]
        ):
            """Update live metrics for a specific model"""
            current_time = time.time()
            is_intermediate = metrics.get("is_intermediate", False)

            # Set benchmark start time when first metrics arrive
            if benchmark_start_times[model_index] is None:
                benchmark_start_times[model_index] = current_time

            # Calculate total elapsed time for this model
            total_elapsed_time = current_time - benchmark_start_times[model_index]

            # For intermediate updates, throttle to max 10 updates per second per model
            if is_intermediate:
                time_since_last = current_time - last_intermediate_update[model_index]
                if time_since_last < 0.1:  # 100ms throttle
                    return
                last_intermediate_update[model_index] = current_time

            # Update metrics for the specific model
            if model_index == 0:
                live_metrics["model1_completed_requests"] = completed
                live_metrics["model1_live_tps"] = metrics.get("current_tps", 0)
                live_metrics["model1_live_ttft"] = metrics.get(
                    "avg_ttft", 0
                )  # Already in ms
                live_metrics["model1_live_rps"] = metrics.get("current_rps", 0)
                live_metrics["model1_total_time"] = (
                    total_elapsed_time * 1000
                )  # Convert to ms
            else:
                live_metrics["model2_completed_requests"] = completed
                live_metrics["model2_live_tps"] = metrics.get("current_tps", 0)
                live_metrics["model2_live_ttft"] = metrics.get(
                    "avg_ttft", 0
                )  # Already in ms
                live_metrics["model2_live_rps"] = metrics.get("current_rps", 0)
                live_metrics["model2_total_time"] = (
                    total_elapsed_time * 1000
                )  # Convert to ms

            # Always stream updates (intermediate or final)
            if live_metrics_callback:
                metrics_copy = live_metrics.copy()
                metrics_copy["update_type"] = (
                    "intermediate" if is_intermediate else "final"
                )
                metrics_copy["model_index"] = model_index
                await live_metrics_callback(metrics_copy)

        # Run benchmarks for each model concurrently
        tasks = []
        for i, model_key in enumerate(model_keys):
            request = BenchmarkRequest(
                model_key=model_key,
                prompt=prompt,
                concurrency=concurrency,
                max_tokens=max_tokens,
                temperature=temperature,
            )

            task = asyncio.create_task(
                self._run_single_benchmark_with_live_metrics(
                    request, i, model_progress_callback
                )
            )
            tasks.append((model_key, task))

        # Wait for all benchmarks to complete
        for model_key, task in tasks:
            results[model_key] = await task

        return results

    async def _run_single_benchmark_with_live_metrics(
        self,
        request: BenchmarkRequest,
        model_index: int,
        progress_callback: Callable[[int, int, Dict[str, Any]], Awaitable[None]],
    ) -> BenchmarkResult:
        """Run a single benchmark with live metrics updates"""
        model_config = self.config.get_model(request.model_key)
        start_time = time.time()
        completed_requests = 0
        successful_results = []
        all_results = []

        async def single_request(req_id: int):
            nonlocal completed_requests, successful_results, all_results

            try:
                request_start = time.time()
                completion_text = ""
                first_token_time = None
                chunk_count = 0
                last_metric_update = 0

                async for chunk in self.benchmark.streamer.stream_completion(
                    model_key=request.model_key,
                    prompt=request.prompt,
                    request_id=f"live_bench_{model_index}_{req_id}",
                    temperature=request.temperature,
                ):
                    current_time = time.time()

                    if first_token_time is None:
                        first_token_time = current_time
                        # Immediately send TTFT update when first token arrives
                        ttft_ms = (first_token_time - request_start) * 1000
                        intermediate_metrics = {
                            "current_tps": 0,  # Will be calculated as tokens accumulate
                            "avg_ttft": ttft_ms,  # Immediate TTFT
                            "current_rps": (completed_requests + 0.5)
                            / (current_time - start_time),  # Progressive RPS
                            "is_intermediate": True,
                            "first_token_received": True,
                        }
                        await progress_callback(
                            model_index, completed_requests, intermediate_metrics
                        )

                    completion_text += chunk
                    chunk_count += 1

                    # Send progressive metrics every 5 chunks or every 100ms
                    if chunk_count % 5 == 0 or current_time - last_metric_update > 0.1:
                        tokens_so_far = len(completion_text.split())
                        elapsed_time = current_time - request_start

                        # Calculate progressive TPS for this request
                        current_tps = (
                            tokens_so_far / elapsed_time if elapsed_time > 0 else 0
                        )

                        # Calculate running average with completed requests
                        if successful_results:
                            avg_tps = (
                                sum(r["tps"] for r in successful_results) + current_tps
                            ) / (len(successful_results) + 1)
                        else:
                            avg_tps = current_tps

                        progressive_metrics = {
                            "current_tps": avg_tps,
                            "avg_ttft": (
                                (first_token_time - request_start) * 1000
                                if first_token_time
                                else 0
                            ),
                            "current_rps": (completed_requests + 0.8)
                            / (current_time - start_time),  # Progressive RPS
                            "is_intermediate": True,
                            "tokens_so_far": tokens_so_far,
                        }

                        await progress_callback(
                            model_index, completed_requests, progressive_metrics
                        )
                        last_metric_update = current_time

                request_end = time.time()
                total_time = request_end - request_start
                ttft = (first_token_time - request_start) if first_token_time else 0
                tokens = len(completion_text.split())  # Rough estimation
                tps = tokens / total_time if total_time > 0 else 0

                result = {
                    "request_id": req_id,
                    "total_time": total_time,
                    "tokens": tokens,
                    "ttft": ttft,
                    "tps": tps,
                    "completion_text": completion_text,
                }

                successful_results.append(result)
                all_results.append(result)
                completed_requests += 1

                # Calculate final metrics for this completed request
                final_metrics = {
                    "current_tps": sum(r["tps"] for r in successful_results)
                    / len(successful_results),
                    "avg_ttft": sum(r["ttft"] for r in successful_results)
                    / len(successful_results)
                    * 1000,  # Convert to ms
                    "current_rps": completed_requests / (time.time() - start_time),
                    "is_intermediate": False,
                }

                # Notify progress with final metrics
                await progress_callback(model_index, completed_requests, final_metrics)

                return result

            except Exception as e:
                logger.warning(f"Request {req_id} failed: {str(e)}")
                error_result = {
                    "request_id": req_id,
                    "total_time": 0,
                    "tokens": 0,
                    "ttft": 0,
                    "tps": 0,
                    "error": str(e),
                    "completion_text": "",
                }
                all_results.append(error_result)
                completed_requests += 1

                # Report as completion to frontend (hide failure details)
                current_metrics = {
                    "current_tps": sum(r["tps"] for r in successful_results)
                    / max(len(successful_results), 1),
                    "avg_ttft": sum(r["ttft"] for r in successful_results)
                    / max(len(successful_results), 1)
                    * 1000,  # Convert to ms
                    "current_rps": completed_requests / (time.time() - start_time),
                    "is_intermediate": False,
                }
                await progress_callback(
                    model_index, completed_requests, current_metrics
                )

                return error_result

        # Run concurrent requests with proper completion tracking
        tasks = [single_request(i) for i in range(request.concurrency)]
        results_from_gather = await asyncio.gather(*tasks, return_exceptions=True)

        # Handle any silent failures from asyncio.gather
        for i, result in enumerate(results_from_gather):
            if isinstance(result, Exception):
                logger.warning(f"Request {i} failed silently: {str(result)}")
                # Check if this request wasn't already counted in our trackers
                if len(all_results) < completed_requests + 1:
                    error_result = {
                        "request_id": i,
                        "total_time": 0,
                        "tokens": 0,
                        "ttft": 0,
                        "tps": 0,
                        "error": str(result),
                        "completion_text": "",
                    }
                    all_results.append(error_result)
                    completed_requests += 1

        total_time = time.time() - start_time

        if not successful_results:
            return BenchmarkResult(
                model_name=model_config["name"],
                model_id=model_config["id"],
                concurrency=request.concurrency,
                prompt=request.prompt,
                total_time=total_time,
                avg_time_to_first_token=0,
                avg_tokens_per_second=0,
                aggregate_tokens_per_second=0,
                peak_tokens_per_second=0,
                total_requests=request.concurrency,
                successful_requests=0,
                error_rate=1.0,
                total_tokens_generated=0,
                avg_tokens_per_request=0,
                sample_completion="",
                completion_lengths=[],
                individual_results=all_results,
                error_messages=[
                    r.get("error", "") for r in all_results if "error" in r
                ],
                timestamp=start_time,
                config_used={
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "model_config": model_config,
                },
            )

        # Calculate final metrics
        total_tokens = sum(r["tokens"] for r in successful_results)
        avg_tps = sum(r["tps"] for r in successful_results) / len(successful_results)
        avg_ttft = sum(r["ttft"] for r in successful_results) / len(successful_results)
        aggregate_tps = total_tokens / total_time if total_time > 0 else 0
        peak_tps = (
            max(r["tps"] for r in successful_results) if successful_results else 0
        )
        completion_lengths = [len(r["completion_text"]) for r in successful_results]
        avg_tokens_per_request = (
            total_tokens / len(successful_results) if successful_results else 0
        )

        return BenchmarkResult(
            model_name=model_config["name"],
            model_id=model_config["id"],
            concurrency=request.concurrency,
            prompt=request.prompt,
            total_time=total_time,
            avg_time_to_first_token=avg_ttft,
            avg_tokens_per_second=avg_tps,
            aggregate_tokens_per_second=aggregate_tps,
            peak_tokens_per_second=peak_tps,
            total_requests=request.concurrency,
            successful_requests=len(successful_results),
            error_rate=(request.concurrency - len(successful_results))
            / request.concurrency,
            total_tokens_generated=total_tokens,
            avg_tokens_per_request=avg_tokens_per_request,
            sample_completion=(
                successful_results[0]["completion_text"] if successful_results else ""
            ),
            completion_lengths=completion_lengths,
            individual_results=all_results,
            error_messages=[r.get("error", "") for r in all_results if "error" in r],
            timestamp=start_time,
            config_used={
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
                "model_config": model_config,
            },
        )


class BenchmarkReporter:
    """Generate reports from benchmark results"""

    @staticmethod
    def generate_comparison_report(
        results: Dict[str, BenchmarkResult],
    ) -> Dict[str, Any]:
        """Generate a comparison report from multiple benchmark results"""
        if not results:
            return {"error": "No results to compare"}

        # Find best performers
        best_aggregate_tps = max(
            results.values(), key=lambda r: r.aggregate_tokens_per_second
        )
        best_avg_tps = max(results.values(), key=lambda r: r.avg_tokens_per_second)
        best_ttft = min(results.values(), key=lambda r: r.avg_time_to_first_token)
        most_reliable = max(results.values(), key=lambda r: r.success_rate)

        return {
            "summary": {
                "models_tested": len(results),
                "total_requests": sum(r.total_requests for r in results.values()),
                "total_successful": sum(
                    r.successful_requests for r in results.values()
                ),
            },
            "winners": {
                "best_aggregate_throughput": {
                    "model": best_aggregate_tps.model_name,
                    "tokens_per_second": best_aggregate_tps.aggregate_tokens_per_second,
                },
                "best_average_throughput": {
                    "model": best_avg_tps.model_name,
                    "tokens_per_second": best_avg_tps.avg_tokens_per_second,
                },
                "fastest_first_token": {
                    "model": best_ttft.model_name,
                    "time_ms": best_ttft.avg_time_to_first_token * 1000,
                },
                "most_reliable": {
                    "model": most_reliable.model_name,
                    "success_rate": most_reliable.success_rate,
                },
            },
            "detailed_results": {k: v.to_dict() for k, v in results.items()},
            "generated_at": time.time(),
        }

    @staticmethod
    def export_to_json(results: Dict[str, BenchmarkResult], filepath: str) -> None:
        """Export benchmark results to JSON file"""
        report = BenchmarkReporter.generate_comparison_report(results)
        with open(filepath, "w") as f:
            json.dump(report, f, indent=2)

    @staticmethod
    def export_to_csv(results: Dict[str, BenchmarkResult], filepath: str) -> None:
        """Export benchmark results to CSV file"""
        import csv

        with open(filepath, "w", newline="") as f:
            writer = csv.writer(f)

            # Header
            writer.writerow(
                [
                    "Model",
                    "Model_ID",
                    "Concurrency",
                    "Total_Requests",
                    "Successful_Requests",
                    "Success_Rate_%",
                    "Total_Time_s",
                    "Avg_TPS",
                    "Aggregate_TPS",
                    "Peak_TPS",
                    "Avg_TTFT_ms",
                    "Total_Tokens",
                    "Avg_Tokens_Per_Request",
                    "Error_Rate_%",
                ]
            )

            # Data rows
            for result in results.values():
                writer.writerow(
                    [
                        result.model_name,
                        result.model_id,
                        result.concurrency,
                        result.total_requests,
                        result.successful_requests,
                        result.success_rate,
                        result.total_time,
                        result.avg_tokens_per_second,
                        result.aggregate_tokens_per_second,
                        result.peak_tokens_per_second,
                        result.avg_time_to_first_token * 1000,
                        result.total_tokens_generated,
                        result.avg_tokens_per_request,
                        result.error_rate * 100,
                    ]
                )
