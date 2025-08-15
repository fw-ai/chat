import asyncio
import time
import json
import aiohttp
from typing import AsyncGenerator, Dict, Any, Optional, Callable, Tuple, List
from dataclasses import dataclass
from src.logger import logger
from src.constants.configs import APP_CONFIG, MARKETING_CONFIG
from src.llm_inference.utils import add_user_request_to_prompt
from dotenv import load_dotenv

load_dotenv()

DEFAULT_TEMPERATURE = APP_CONFIG["defaults"]["temperature"]
_MAX_TOKENS = 16384


@dataclass
class StreamingStats:
    """Statistics for a streaming response"""

    request_id: str
    start_time: float
    completion_text: str = ""
    error_message: Optional[str] = None
    fireworks_metrics: Optional[Dict[str, Any]] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    # Fallback manual tracking
    _manual_first_token_time: Optional[float] = None
    _manual_tokens_generated: int = 0
    _manual_characters_generated: int = 0

    @property
    def total_time(self) -> float:
        """Total time in seconds"""
        return time.time() - self.start_time

    @property
    def time_to_first_token(self) -> float:
        """Time to first token in seconds (prefer SDK metrics)"""
        if self.fireworks_metrics:
            if "server-time-to-first-token" in self.fireworks_metrics:
                return (
                    float(self.fireworks_metrics["server-time-to-first-token"]) / 1000.0
                )
            elif "fireworks-server-time-to-first-token" in self.fireworks_metrics:
                return (
                    float(
                        self.fireworks_metrics["fireworks-server-time-to-first-token"]
                    )
                    / 1000.0
                )

        # Fallback to manual tracking
        if self._manual_first_token_time:
            return self._manual_first_token_time - self.start_time
        return 0

    @property
    def tokens_per_second(self) -> float:
        """Tokens per second throughput (prefer SDK metrics)"""
        # Use completion tokens from Fireworks SDK if available
        tokens = (
            self.completion_tokens
            if self.completion_tokens > 0
            else self._manual_tokens_generated
        )
        if self.total_time > 0 and tokens > 0:
            return tokens / self.total_time
        return 0

    @property
    def tokens_generated(self) -> int:
        """Total tokens generated (prefer SDK metrics)"""
        return (
            self.completion_tokens
            if self.completion_tokens > 0
            else self._manual_tokens_generated
        )

    @property
    def characters_generated(self) -> int:
        """Characters generated"""
        return self._manual_characters_generated

    @property
    def server_processing_time(self) -> float:
        """Server processing time from Fireworks metrics (in seconds)"""
        if self.fireworks_metrics and "fireworks-server-time" in self.fireworks_metrics:
            return float(self.fireworks_metrics["fireworks-server-time"]) / 1000.0
        return 0

    def update_from_fireworks_metrics(self, perf_metrics: Dict[str, Any]) -> None:
        """Update stats with Fireworks SDK performance metrics"""
        self.fireworks_metrics = perf_metrics

        # Extract token counts if available
        if "usage" in perf_metrics:
            usage = perf_metrics["usage"]
            self.prompt_tokens = usage.get("prompt_tokens", 0)
            self.completion_tokens = usage.get("completion_tokens", 0)
            self.total_tokens = usage.get("total_tokens", 0)

    def update_manual_tracking(self, text: str) -> None:
        """Update manual tracking stats with new text"""
        if self._manual_first_token_time is None:
            self._manual_first_token_time = time.time()

        self.completion_text += text
        self._manual_characters_generated += len(text)
        # Rough token estimation (fallback only)
        self._manual_tokens_generated = len(self.completion_text.split())

    def update_usage_from_chunk(self, chunk_data: Dict[str, Any]) -> None:
        """Extract and update usage info from chunk data"""
        usage = chunk_data.get("usage")
        if usage and isinstance(usage, dict):
            self.prompt_tokens = usage.get("prompt_tokens", 0)
            self.completion_tokens = usage.get("completion_tokens", 0)
            self.total_tokens = usage.get("total_tokens", 0)


class FireworksConfig:
    """Configuration loader for Fireworks models"""

    def __init__(self):
        self.config = APP_CONFIG

    def get_model(self, model_id: str) -> Dict[str, Any]:
        """Get model configuration by model ID"""
        logger.info(f"get_model called with: {model_id}")
        logger.info(f"MARKETING_CONFIG keys: {list(MARKETING_CONFIG.keys())}")

        # First check if this is already a model ID in marketing config
        if model_id in MARKETING_CONFIG:
            logger.info(f"Found {model_id} in marketing config")
            # Get the marketing data to extract the proper model ID from the link
            marketing_data = MARKETING_CONFIG[model_id]
            link = marketing_data.get("link", "")

            # Extract model ID from link: "/models/fireworks/model-name" -> "accounts/fireworks/models/model-name"
            if link.startswith("/models/fireworks/"):
                fireworks_model_id = f"accounts/fireworks/models/{link.split('/')[-1]}"
                logger.info(f"Extracted Fireworks model ID: {fireworks_model_id}")

                # Return a config with the proper Fireworks model ID
                return {"id": fireworks_model_id, "original_id": model_id, "link": link}
            else:
                logger.warning(f"Unexpected link format: {link}")
                # Fallback to original behavior
                for model_key, model_config in self.config["models"].items():
                    if model_config["id"] == model_id:
                        logger.info(
                            f"Found matching config for {model_id}: {model_config}"
                        )
                        return model_config
                raise ValueError(
                    f"Model ID {model_id} found in marketing config but not in local config"
                )

        # If not found in marketing config, maybe it's a model key
        if model_id in self.config["models"]:
            logger.info(f"Found {model_id} as model key in local config")
            return self.config["models"][model_id]

        logger.error(f"Model {model_id} not found anywhere")
        raise ValueError(f"Model {model_id} not found in config")

    @staticmethod
    def get_all_models() -> Dict[str, Dict[str, Any]]:
        """Get all available models"""
        return MARKETING_CONFIG

    def get_defaults(self) -> Dict[str, Any]:
        """Get default settings"""
        return self.config.get("defaults", {})


class FireworksStreamer:
    """Helper class for streaming responses from Fireworks"""

    def __init__(self, api_key: Optional[str] = None):
        # Use provided API key or fall back to environment variable for free tier
        import os

        self.api_key = api_key or os.getenv("FIREWORKS_API_KEY")
        if not self.api_key:
            raise ValueError(
                "No API key provided and FIREWORKS_API_KEY environment variable not set"
            )
        self.config = FireworksConfig()
        self.base_url = APP_CONFIG["base_url"]
        self.session = None

    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        # Check if session exists and is not closed
        if self.session is None or self.session.closed:
            # Clean up old session if it exists
            if self.session and not self.session.closed:
                try:
                    await self.session.close()
                except Exception as e:
                    logger.error(f"Error closing session: {e}")
                    pass

            # Create new session
            try:
                self.session = aiohttp.ClientSession()
            except RuntimeError as e:
                if "event loop is closed" in str(e):
                    # Event loop is closed, create a new one (serverless environment)
                    import asyncio

                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    self.session = aiohttp.ClientSession()
                else:
                    raise

        return self.session

    def _prepare_llm_request(
        self,
        request_id: Optional[str],
        temperature: Optional[float],
        request_prefix: str,
    ) -> Tuple[str, float, StreamingStats]:
        """Prepares parameters and stats for an LLM request."""
        if not request_id:
            request_id = f"{request_prefix}_{int(time.time() * 1000)}"

        defaults = self.config.get_defaults()
        temperature = temperature or defaults.get("temperature", DEFAULT_TEMPERATURE)
        stats = StreamingStats(request_id=request_id, start_time=time.time())

        return request_id, temperature, stats

    def _prepare_headers(self) -> Dict[str, str]:
        """Prepare headers for API request"""
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    @staticmethod
    def _prepare_base_payload(
        model_config: Dict[str, Any],
        temperature: float,
        enable_perf_metrics: bool,
        function_definitions: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Prepare base payload common to both completion types"""
        payload = {
            "model": model_config["id"],
            "temperature": temperature,
            "stream": True,
            "max_tokens": _MAX_TOKENS,
        }

        if function_definitions and len(function_definitions) > 0:
            tools = [
                {"type": "function", "function": func_def}
                for func_def in function_definitions
            ]
            payload["tools"] = tools

        if enable_perf_metrics:
            payload["perf_metrics_in_response"] = True

        return payload

    @staticmethod
    async def _parse_streaming_response(
        response: aiohttp.ClientResponse,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Parse Server-Sent Events from streaming response"""
        buffer = ""
        async for chunk in response.content.iter_any():
            buffer += chunk.decode("utf-8")

            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()

                if not line:
                    continue

                if line.startswith("data: "):
                    data_str = line[6:]  # Remove 'data: ' prefix
                    if data_str == "[DONE]":
                        return

                    try:
                        chunk_data = json.loads(data_str)
                        yield chunk_data
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse JSON: {data_str}")
                        continue

    @staticmethod
    def _extract_completion_text(
        chunk_data: Dict[str, Any], is_chat: bool = False
    ) -> Tuple[str, Optional[str], Optional[List[Dict[str, Any]]]]:
        """Extract text, finish_reason, and tool_calls from chunk data for both completion types"""
        if "choices" not in chunk_data or len(chunk_data["choices"]) == 0:
            return "", None, None

        choice = chunk_data["choices"][0]
        finish_reason = choice.get("finish_reason")
        tool_calls = None

        if is_chat:
            delta = choice.get("delta", {})
            text = delta.get("content", "")
            # Check for tool calls in the delta
            if "tool_calls" in delta:
                tool_calls = delta["tool_calls"]
        else:
            text = choice.get("text", "")
            # For completions, tool calls might be in the choice itself
            if "tool_calls" in choice:
                tool_calls = choice["tool_calls"]

        return text, finish_reason, tool_calls

    @staticmethod
    def _process_performance_metrics(
        chunk_data: Dict[str, Any],
        stats: StreamingStats,
        finish_reason: Optional[str],
        enable_perf_metrics: bool,
    ) -> None:
        """Process performance metrics if available and enabled"""
        if enable_perf_metrics and "perf_metrics" in chunk_data and finish_reason:
            stats.update_from_fireworks_metrics(chunk_data["perf_metrics"])

    async def _stream_request(
        self,
        endpoint: str,
        payload: Dict[str, Any],
        stats: StreamingStats,
        callback: Optional[Callable[[str, StreamingStats], None]],
        enable_perf_metrics: bool,
        is_chat: bool = False,
        include_tools: bool = False,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Core streaming logic shared between completion types"""
        session = None

        # Track tool calls across chunks
        accumulated_tool_calls = {}

        try:
            try:
                session = aiohttp.ClientSession()
            except RuntimeError as e:
                if "event loop is closed" in str(e):
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    session = aiohttp.ClientSession()
                else:
                    raise

            headers = self._prepare_headers()
            url = f"{self.base_url}/{endpoint}"

            async with session.post(url, headers=headers, json=payload) as response:
                response.raise_for_status()

                async for chunk_data in self._parse_streaming_response(response):
                    text, finish_reason, tool_calls_delta = (
                        self._extract_completion_text(chunk_data, is_chat)
                    )
                    self._process_performance_metrics(
                        chunk_data, stats, finish_reason, enable_perf_metrics
                    )
                    stats.update_usage_from_chunk(chunk_data)

                    # Process tool calls if present
                    if include_tools and tool_calls_delta:
                        for tool_call in tool_calls_delta:
                            index = tool_call.get("index", 0)

                            # Initialize this tool call if we haven't seen it
                            if index not in accumulated_tool_calls:
                                accumulated_tool_calls[index] = {
                                    "id": "",
                                    "name": "",
                                    "arguments": "",
                                    "type": "function",
                                }

                            # Update tool call ID if provided
                            if tool_call.get("id"):
                                accumulated_tool_calls[index]["id"] = tool_call["id"]

                            # Update function name if provided
                            if tool_call.get("function") and tool_call["function"].get(
                                "name"
                            ):
                                accumulated_tool_calls[index]["name"] = tool_call[
                                    "function"
                                ]["name"]

                            # Accumulate arguments if provided
                            if tool_call.get("function") and tool_call["function"].get(
                                "arguments"
                            ):
                                accumulated_tool_calls[index]["arguments"] += tool_call[
                                    "function"
                                ]["arguments"]

                    result = {}
                    if text:
                        stats.update_manual_tracking(text)
                        if callback:
                            callback(text, stats)

                        if include_tools:
                            result["content"] = text
                        else:
                            # Legacy mode: yield just the text string
                            yield {"text": text}
                            continue

                    # Send accumulated tool calls when we have a finish reason of "tool_calls"
                    if (
                        include_tools
                        and finish_reason == "tool_calls"
                        and accumulated_tool_calls
                    ):
                        # Parse completed tool calls
                        completed_tool_calls = []
                        for index, tool_call in accumulated_tool_calls.items():
                            try:
                                # Try to parse the JSON arguments
                                parsed_args = (
                                    json.loads(tool_call["arguments"])
                                    if tool_call["arguments"]
                                    else {}
                                )
                                completed_tool_calls.append(
                                    {
                                        "id": tool_call["id"],
                                        "name": tool_call["name"],
                                        "arguments": parsed_args,
                                    }
                                )
                            except json.JSONDecodeError:
                                # If JSON parsing fails, send raw arguments
                                completed_tool_calls.append(
                                    {
                                        "id": tool_call["id"],
                                        "name": tool_call["name"],
                                        "arguments": tool_call["arguments"],
                                    }
                                )

                        result["tool_calls"] = completed_tool_calls

                    if include_tools and finish_reason:
                        result["finish_reason"] = finish_reason

                    # For include_tools mode, only yield if we have something
                    if include_tools and result:
                        yield result

        except Exception as e:
            error_msg = f"Error in streaming {endpoint}: {str(e)}"
            logger.error(error_msg)
            stats.error_message = error_msg

            if callback:
                callback("", stats)

            raise e
        finally:
            if session and not session.closed:
                try:
                    await session.close()
                except Exception as e:
                    logger.error(f"Error closing session: {e}")
                    pass

    async def stream_completion(
        self,
        model_key: str,
        prompt: str,
        request_id: str = None,
        temperature: float = None,
        callback: Optional[Callable[[str, StreamingStats], None]] = None,
        enable_perf_metrics: bool = False,
    ) -> AsyncGenerator[str, None]:
        """
        Stream completion from Fireworks model

        Args:
            model_key: Key for model in config
            prompt: Input prompt
            request_id: Unique request identifier
            temperature: Sampling temperature
            callback: Optional callback for streaming stats
            enable_perf_metrics: enable Fireworks SDK perf metrics tracking

        Yields:
            Text chunks as they're generated
        """
        request_id, temperature, stats = self._prepare_llm_request(
            request_id, temperature, "req"
        )

        model_config = self.config.get_model(model_key)
        payload = self._prepare_base_payload(
            model_config, temperature, enable_perf_metrics
        )
        payload["prompt"] = add_user_request_to_prompt(prompt)

        async for chunk in self._stream_request(
            "completions", payload, stats, callback, enable_perf_metrics, is_chat=False
        ):
            yield chunk.get("text", "")

    async def stream_chat_completion(
        self,
        model_key: str,
        messages: list,
        request_id: str = None,
        temperature: float = None,
        callback: Optional[Callable[[str, StreamingStats], None]] = None,
        enable_perf_metrics: bool = False,
        function_definitions: Optional[List[Dict[str, Any]]] = None,
        include_tools: bool = False,
    ) -> AsyncGenerator[Any, None]:
        """
        Stream chat completion from Fireworks model

        Args:
            model_key: Key for model in config
            messages: List of chat messages (with prompts already formatted)
            request_id: Unique request identifier
            temperature: Sampling temperature
            callback: Optional callback for streaming stats
            enable_perf_metrics: enable Fireworks SDK perf metrics tracking
            function_definitions: Function definitions for prompt-based function calling
            include_tools: Include tools in the response

        Yields:
            Text chunks as they're generated
        """
        request_id, temperature, stats = self._prepare_llm_request(
            request_id, temperature, "chat"
        )

        model_config = self.config.get_model(model_key)
        logger.info(f"Model key received: {model_key}")
        logger.info(f"Model config: {model_config}")

        payload = self._prepare_base_payload(
            model_config=model_config,
            temperature=temperature,
            enable_perf_metrics=enable_perf_metrics,
            function_definitions=function_definitions,
        )
        logger.info(f"Payload model: {payload.get('model')}")
        payload["messages"] = messages

        async for chunk in self._stream_request(
            "chat/completions",
            payload,
            stats,
            callback,
            enable_perf_metrics,
            is_chat=True,
            include_tools=include_tools,
        ):
            if include_tools:
                yield chunk
            else:
                yield chunk.get("text", "")

    async def close(self):
        """Close the aiohttp session"""
        if self.session:
            await self.session.close()
            self.session = None


class FireworksBenchmark:
    """Benchmark helper for Fireworks models"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.config = FireworksConfig()
        self.streamer = FireworksStreamer(api_key)

    async def _execute_single_request(
        self, req_id: int, model_key: str, prompt: str, temperature: float
    ) -> Dict[str, Any]:
        """Execute a single benchmark request"""
        request_stats = []

        def stats_callback(text: str, stats: StreamingStats):
            request_stats.append(
                {
                    "time": stats.total_time,
                    "tokens": stats.tokens_generated,
                    "ttft": stats.time_to_first_token,
                    "tps": stats.tokens_per_second,
                }
            )

        try:
            async with FireworksStreamer(self.api_key) as streamer:
                completion_text = ""
                async for chunk in streamer.stream_completion(
                    model_key=model_key,
                    prompt=add_user_request_to_prompt(prompt),
                    request_id=f"bench_{req_id}",
                    temperature=temperature,
                    callback=stats_callback,
                ):
                    completion_text += chunk

                final_stats = (
                    request_stats[-1]
                    if request_stats
                    else {"time": 0, "tokens": 0, "ttft": 0, "tps": 0}
                )
                final_stats.update(
                    {"completion_text": completion_text, "request_id": req_id}
                )
                return final_stats

        except Exception as e:
            logger.error(f"Request {req_id} failed: {str(e)}")
            return {
                "request_id": req_id,
                "time": 0,
                "tokens": 0,
                "ttft": 0,
                "tps": 0,
                "error": str(e),
                "completion_text": "",
            }

    def _calculate_benchmark_metrics(
        self, results: list, concurrency: int, total_time: float, model_key: str
    ) -> Dict[str, Any]:
        """Calculate aggregated benchmark metrics"""
        successful_results = [
            r
            for r in results
            if not isinstance(r, Exception) and r.get("tokens", 0) > 0
        ]

        if not successful_results:
            return {
                "model": self.config.get_model(model_key)["name"],
                "concurrency": concurrency,
                "total_requests": concurrency,
                "successful_requests": 0,
                "total_time": total_time,
                "avg_tokens_per_second": 0,
                "avg_time_to_first_token": 0,
                "aggregate_tokens_per_second": 0,
                "total_tokens": 0,
                "error_rate": 1.0,
            }

        # Calculate aggregated metrics
        total_tokens = sum(r["tokens"] for r in successful_results)
        avg_tps = sum(r["tps"] for r in successful_results) / len(successful_results)
        avg_ttft = sum(r["ttft"] for r in successful_results) / len(successful_results)
        aggregate_tps = total_tokens / total_time if total_time > 0 else 0

        return {
            "model": self.config.get_model(model_key)["name"],
            "concurrency": concurrency,
            "total_requests": concurrency,
            "successful_requests": len(successful_results),
            "total_time": total_time,
            "avg_tokens_per_second": avg_tps,
            "avg_time_to_first_token": avg_ttft,
            "aggregate_tokens_per_second": aggregate_tps,
            "total_tokens": total_tokens,
            "error_rate": (concurrency - len(successful_results)) / concurrency,
            "sample_completion": (
                successful_results[0]["completion_text"] if successful_results else ""
            ),
            "individual_results": successful_results,
        }

    async def run_concurrent_benchmark(
        self,
        model_key: str,
        prompt: str,
        concurrency: int = 10,
        temperature: float = None,
    ) -> Dict[str, Any]:
        """
        Run concurrent requests for benchmarking

        Returns:
            Dictionary with aggregated benchmark results
        """
        start_time = time.time()
        tasks = [
            self._execute_single_request(i, model_key, prompt, temperature)
            for i in range(concurrency)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        total_time = time.time() - start_time

        return self._calculate_benchmark_metrics(
            results, concurrency, total_time, model_key
        )
