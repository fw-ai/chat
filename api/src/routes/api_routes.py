from typing import Dict, List, Optional, Any, Annotated
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
import uuid

from src.modules.llm_completion import FireworksStreamer, FireworksConfig
from src.modules.session import SessionManager
from src.modules.auth import (
    get_validated_api_key,
    get_api_key_safe_for_logging,
    get_optional_api_key,
)
from src.modules.rate_limiter import DualLayerRateLimiter, count_message_with_rate_limit
from src.services.comparison_service import ComparisonService, MetricsStreamer
from src.services.dependencies import (
    get_config,
    get_session_manager,
    get_comparison_service,
    get_rate_limiter,
    get_models,
    AppServices,
)
from src.logger import logger
from src.modules.utils import add_function_calling_to_prompt, add_user_request_to_prompt
from src.modules.llm_completion import DEFAULT_TEMPERATURE

app = FastAPI(
    title="Fireworks Chat & Benchmark API",
    description="API for chat interactions and performance benchmarking with Fireworks models",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services are now managed through dependency injection


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on app shutdown"""
    try:
        services = AppServices.get_instance()
        await services.cleanup()
    except Exception as e:
        logger.error(f"Error during app shutdown: {str(e)}")


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class SingleChatRequest(BaseModel):
    model_key: str = Field(..., description="Model key from config")
    messages: List[ChatMessage] = Field(..., description="List of chat messages")
    temperature: Optional[float] = Field(
        DEFAULT_TEMPERATURE, description="Sampling temperature"
    )
    conversation_id: Optional[str] = Field(
        None, description="Conversation ID for single chat tracking"
    )
    comparison_id: Optional[str] = Field(
        None, description="Comparison ID when part of a comparison chat"
    )
    function_definitions: Optional[List[Dict[str, Any]]] = Field(
        None, description="Function definitions for prompt-based function calling"
    )


class ChatCompletionRequest(BaseModel):
    model_key: str = Field(..., description="Model key from config")
    messages: List[ChatMessage] = Field(..., description="List of chat messages")
    temperature: Optional[float] = Field(
        DEFAULT_TEMPERATURE, description="Sampling temperature"
    )
    conversation_id: Optional[str] = Field(
        None, description="Conversation ID for tracking"
    )


class BenchmarkConfigRequest(BaseModel):
    model_key: str = Field(..., description="Model key to benchmark")
    prompt: str = Field(..., description="Test prompt")
    concurrency: int = Field(
        10, ge=1, le=100, description="Number of concurrent requests"
    )
    max_tokens: int = Field(
        256, ge=50, le=1024, description="Maximum tokens per request"
    )
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="Sampling temperature")


class ComparisonBenchmarkRequest(BaseModel):
    model_keys: List[str] = Field(..., description="Model keys to compare")
    prompt: str = Field(..., description="Test prompt")
    concurrency: int = Field(
        10, ge=1, le=100, description="Number of concurrent requests"
    )
    max_tokens: int = Field(
        256, ge=50, le=1024, description="Maximum tokens per request"
    )
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="Sampling temperature")


class MetricsRequest(BaseModel):
    model_keys: List[str] = Field(
        ..., min_items=2, description="Model keys to benchmark"
    )
    comparison_id: Optional[str] = Field(None, description="Comparison ID for context")
    concurrency: int = Field(1, ge=1, le=50, description="Concurrent requests")
    temperature: Optional[float] = Field(0.7, description="Sampling temperature")
    prompt: Optional[str] = Field(
        None, description="Test prompt (auto-detected if not provided)"
    )


class ComparisonInitRequest(BaseModel):
    model_keys: List[str] = Field(
        ..., min_items=2, max_items=4, description="Models to compare"
    )
    messages: List[ChatMessage] = Field(..., description="Initial conversation context")
    function_definitions: Optional[List[Dict[str, Any]]] = Field(
        None, description="Function definitions for prompt-based function calling"
    )


def validate_model_key(model_key: str, config: FireworksConfig) -> bool:
    """Validate that model key exists in config"""
    try:
        config.get_model(model_key)
    except ValueError:
        return False
    return True


def generate_session_id() -> str:
    """Generate unique session ID"""
    return str(uuid.uuid4())


async def _stream_response_with_session(
    model_key: str,
    messages: List[Dict[str, Any]],
    session_id: str,
    temperature: Optional[float],
    error_context: str,
    client_api_key: Optional[str],
    session_manager: SessionManager,
    function_definitions: Optional[List[Dict[str, Any]]] = None,
):
    """Helper to stream chat responses and save assistant responses to session."""
    assistant_content = ""

    try:
        client_streamer = FireworksStreamer(client_api_key)

        # Get the latest user message to format with appropriate prompt
        if messages and messages[-1].get("role") == "user":
            user_request = messages[-1]["content"]

            # Use function calling prompt if function definitions are provided, otherwise default prompt
            if function_definitions and len(function_definitions) > 0:
                logger.info("Using function calling prompt with function definitions")
                formatted_prompt = add_function_calling_to_prompt(
                    user_request, function_definitions
                )
            else:
                logger.info("Using default prompt")
                formatted_prompt = add_user_request_to_prompt(user_request)

            # Replace the last message with the formatted prompt
            messages[-1] = {"role": "user", "content": formatted_prompt}

        # Stream chat completion using the formatted messages
        # Check if we have function definitions to determine if we need tool support
        use_tools = function_definitions and len(function_definitions) > 0

        async for chunk in client_streamer.stream_chat_completion(
            model_key=model_key,
            messages=messages,
            request_id=session_id,
            temperature=temperature,
            function_definitions=function_definitions,
            include_tools=use_tools,
        ):
            if use_tools:
                # Enhanced mode with tool calls
                if "content" in chunk and chunk["content"]:
                    assistant_content += chunk["content"]
                    yield f"data: {json.dumps({'type': 'content', 'content': chunk['content']})}\n\n"

                if "tool_calls" in chunk and chunk["tool_calls"]:
                    yield f"data: {json.dumps({'type': 'tool_calls', 'tool_calls': chunk['tool_calls']})}\n\n"

                if "finish_reason" in chunk and chunk["finish_reason"]:
                    yield f"data: {json.dumps({'type': 'finish_reason', 'finish_reason': chunk['finish_reason']})}\n\n"
            else:
                # Legacy text-only mode
                assistant_content += chunk
                yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"

        if assistant_content:
            session_manager.add_assistant_message(
                session_id, assistant_content, model_key
            )

        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"

    except Exception as e:
        logger.error(f"Error in {error_context}: {str(e)}")
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"


async def check_auth_only(http_request: Request) -> Optional[str]:
    """
    Check authentication only - rate limiting handled separately by /api/count-message

    Args:
        http_request: FastAPI request object

    Returns:
        Optional[str]: Validated API key or None if no API key provided

    Raises:
        HTTPException: If authentication fails (401)
    """
    client_api_key = await get_optional_api_key(http_request)

    if client_api_key:
        client_api_key = await get_validated_api_key(http_request)

    return client_api_key


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Fireworks Chat & Benchmark API", "status": "healthy"}


@app.get("/models")
async def get_available_models(
    function_calling: Optional[bool] = None,
    models: Annotated[Dict[str, Any], Depends(get_models)] = None,
):
    """Get all available models, optionally filtered by function calling capability"""
    try:
        if not models:
            logger.error(f"Models is falsy: models={models}, type={type(models)}")
            raise HTTPException(status_code=500, detail="No models available")

        logger.info(f"Total models available: {len(models)}")

        if function_calling is True:
            # Only show models that support function calling
            filtered_models = {}
            for key, model in models.items():
                model_supports_fc = model.get("function_calling", False)
                if model_supports_fc:
                    filtered_models[key] = model
            models = filtered_models
            logger.info(
                f"Function calling filter applied (true), filtered to {len(models)} models with function calling support"
            )
        elif function_calling is False:
            # Show all models when function_calling=false
            logger.info(
                f"Function calling filter set to false - showing all {len(models)} models"
            )
        else:
            logger.info("No function calling filter applied")

        return {"models": models}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting models: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to get available models: {str(e)}"
        )


@app.get("/models/{model_key}")
async def get_model_info(
    model_key: str,
    config: Annotated[FireworksConfig, Depends(get_config)],
):
    """Get detailed information about a specific model"""
    try:
        if not validate_model_key(model_key, config):
            raise HTTPException(
                status_code=404, detail=f"Model '{model_key}' not found"
            )

        model_info = config.get_model(model_key)
        return {"model": model_info}
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Model '{model_key}' not found")
    except Exception as e:
        logger.error(f"Error getting model info: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get model information")


@app.get("/sessions/stats")
async def get_session_stats(
    session_manager: Annotated[SessionManager, Depends(get_session_manager)],
):
    """Get session management statistics"""
    try:
        stats = session_manager.get_session_stats()
        return {"session_stats": stats}
    except Exception as e:
        logger.error(f"Error getting session stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get session statistics")


@app.post("/api/count-message")
async def count_message(
    request: Request,
    rate_limiter: Annotated[DualLayerRateLimiter, Depends(get_rate_limiter)],
):
    """Count one user message before chat - prevents race conditions"""
    try:
        # Check if user has API key
        client_api_key = await get_optional_api_key(request)

        if client_api_key:
            # API key users have unlimited access
            return {
                "allowed": True,
                "remaining": "unlimited",
                "message": "API key user - unlimited access",
            }

        # No API key - use centralized rate limiting logic
        return await count_message_with_rate_limit(request, rate_limiter)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in count-message endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Message counting failed")


@app.get("/debug/redis-status")
async def get_redis_status(
    rate_limiter: Annotated[DualLayerRateLimiter, Depends(get_rate_limiter)],
):
    """Get Redis connection status for debugging deployment issues"""
    try:
        logger.info("Redis status check requested")
        status = await rate_limiter.get_connection_status()
        logger.info(f"Redis status retrieved: {status}")
        return {"redis_status": status}
    except Exception as e:
        logger.error(f"Error getting Redis status: {str(e)}")
        return {
            "redis_status": {
                "error": str(e),
                "connection_healthy": False,
                "diagnostic_failed": True,
            }
        }


@app.get("/sessions")
async def list_sessions(
    session_manager: Annotated[SessionManager, Depends(get_session_manager)],
):
    """List all active sessions"""
    try:
        sessions = session_manager.list_sessions()
        return {"sessions": sessions}
    except Exception as e:
        logger.error(f"Error listing sessions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list sessions")


@app.post("/chat/single")
async def single_chat(
    request: SingleChatRequest,
    http_request: Request,
    config: Annotated[FireworksConfig, Depends(get_config)],
    session_manager: Annotated[SessionManager, Depends(get_session_manager)],
):
    """Single model streaming - works for both solo and comparison chats"""
    try:
        # Rest of function remains exactly the same...
        if not validate_model_key(request.model_key, config):
            raise HTTPException(
                status_code=400, detail=f"Invalid model key: {request.model_key}"
            )

        if request.comparison_id:
            session_id = request.comparison_id
            session_type = "compare"
            primary_id = request.comparison_id
        else:
            session_id = request.conversation_id or generate_session_id()
            session_type = "single"
            primary_id = session_id

        # Check authentication only (rate limiting handled by /api/count-message)
        client_api_key = await check_auth_only(http_request)

        logger.info(
            f"Chat request - Type: {session_type}, Session: {session_id}, "
            f"API key: {get_api_key_safe_for_logging(client_api_key)}"
        )

        if request.comparison_id:
            existing_session = session_manager.get_session(session_id)
            if existing_session and existing_session.model_keys:

                sorted_models = sorted(existing_session.model_keys)
                model_key_concat = "_".join(sorted_models)

                session_manager.get_or_create_session(
                    session_id=session_id,
                    model_key=model_key_concat,
                    session_type=session_type,
                )
            else:
                session_manager.get_or_create_session(
                    session_id=session_id,
                    session_type=session_type,
                )
        else:
            session_manager.get_or_create_session(
                session_id=session_id,
                model_key=request.model_key,
                session_type=session_type,
            )

        if request.messages:
            latest_message = request.messages[-1]
            if latest_message.role == "user":
                session_manager.add_user_message(session_id, latest_message.content)

        messages_dict = session_manager.get_conversation_history(session_id)

        return StreamingResponse(
            _stream_response_with_session(
                model_key=request.model_key,
                messages=messages_dict,
                session_id=session_id,
                temperature=request.temperature,
                error_context=f"{session_type} chat",
                client_api_key=client_api_key,
                session_manager=session_manager,
                function_definitions=request.function_definitions,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Session-ID": session_id,
                "X-Comparison-ID": (
                    request.comparison_id if request.comparison_id else primary_id
                ),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in single chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Chat request failed")


@app.post("/chat/metrics")
async def stream_metrics(
    request: MetricsRequest,
    http_request: Request,
    config: Annotated[FireworksConfig, Depends(get_config)],
    comparison_service: Annotated[ComparisonService, Depends(get_comparison_service)],
):
    """Stream live metrics immediately - completely independent of model responses

    This endpoint requires API key authentication as it performs concurrent benchmarks
    which are computationally expensive.
    """
    try:
        client_api_key = await get_validated_api_key(http_request)

        for model_key in request.model_keys:
            if not validate_model_key(model_key, config):
                raise HTTPException(
                    status_code=400, detail=f"Invalid model key: {model_key}"
                )

        prompt = request.prompt
        if not prompt and request.comparison_id:
            prompt = comparison_service.get_comparison_prompt(request.comparison_id)
        elif not prompt:
            prompt = "Hello, world!"

        logger.info(
            f"Starting metrics stream for models: {request.model_keys}, "
            f"concurrency: {request.concurrency}, "
            f"API key: {get_api_key_safe_for_logging(client_api_key)}"
        )

        # Create metrics streamer and start immediately
        metrics_streamer = MetricsStreamer(client_api_key)

        async def stream_metrics_data():
            """Stream metrics data with proper error handling"""
            try:
                async for data in metrics_streamer.stream_live_metrics(
                    model_keys=request.model_keys,
                    prompt=prompt,
                    concurrency=request.concurrency,
                    temperature=request.temperature or 0.7,
                ):
                    yield f"data: {json.dumps(data)}\n\n"
            except Exception as e:
                logger.error(f"Error in metrics streaming: {str(e)}")
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

        return StreamingResponse(
            stream_metrics_data(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "X-Content-Type-Options": "nosniff",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Cache-Control",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in metrics endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Metrics streaming failed")


@app.post("/chat/compare/init")
async def init_comparison(
    request: ComparisonInitRequest,
    http_request: Request,
    config: Annotated[FireworksConfig, Depends(get_config)],
    comparison_service: Annotated[ComparisonService, Depends(get_comparison_service)],
):
    """Initialize a comparison session - lightweight coordination only"""
    try:
        # Check authentication only (rate limiting handled by /api/count-message)
        await check_auth_only(http_request)

        # Validate all model keys
        for model_key in request.model_keys:
            if not validate_model_key(model_key, config):
                raise HTTPException(
                    status_code=400, detail=f"Invalid model key: {model_key}"
                )

        sorted_models = sorted(request.model_keys)
        model_hash = "_".join(sorted_models)
        comparison_id = f"comp_{hash(model_hash) % 1000000:06d}"

        # Use comparison service to create session
        messages_dict = [
            {"role": msg.role, "content": msg.content} for msg in request.messages
        ]
        comparison_service.create_comparison_session(
            comparison_id=comparison_id,
            model_keys=request.model_keys,
            initial_messages=messages_dict,
        )

        logger.info(
            f"Initialized comparison {comparison_id} for models: {request.model_keys}"
        )

        return {
            "comparison_id": comparison_id,
            "model_keys": request.model_keys,
            "status": "initialized",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error initializing comparison: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to initialize comparison")


@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404, content={"error": "Endpoint not found", "detail": str(exc)}
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Internal server error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": "An unexpected error occurred",
        },
    )
