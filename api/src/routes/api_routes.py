from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
import uuid
from src.modules.llm_completion import FireworksStreamer, FireworksConfig
from src.modules.session import SessionManager
from src.modules.auth import get_validated_api_key, get_api_key_safe_for_logging
from src.services.comparison_service import ComparisonService, MetricsStreamer
from src.logger import logger


app = FastAPI(
    title="Fireworks Chat & Benchmark API",
    description="API for chat interactions and performance benchmarking with Fireworks models",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
config = FireworksConfig()
session_manager = SessionManager(config.config)
comparison_service = ComparisonService(session_manager)
_MODELS = config.get_all_models()


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class SingleChatRequest(BaseModel):
    model_key: str = Field(..., description="Model key from config")
    messages: List[ChatMessage] = Field(..., description="List of chat messages")
    temperature: Optional[float] = Field(0.7, description="Sampling temperature")
    conversation_id: Optional[str] = Field(
        None, description="Conversation ID for single chat tracking"
    )
    comparison_id: Optional[str] = Field(
        None, description="Comparison ID when part of a comparison chat"
    )


class ChatCompletionRequest(BaseModel):
    model_key: str = Field(..., description="Model key from config")
    messages: List[ChatMessage] = Field(..., description="List of chat messages")
    temperature: Optional[float] = Field(0.7, description="Sampling temperature")
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


def validate_model_key(model_key: str) -> bool:
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
    client_api_key: str,
):
    """Helper to stream chat responses and save assistant responses to session."""
    assistant_content = ""

    try:
        # Create a new streamer instance with the client's API key
        client_streamer = FireworksStreamer(client_api_key)

        async for chunk in client_streamer.stream_chat_completion(
            model_key=model_key,
            messages=messages,
            request_id=session_id,
            temperature=temperature,
        ):
            assistant_content += chunk
            yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"

        # Save assistant response to session
        if assistant_content:
            session_manager.add_assistant_message(
                session_id, assistant_content, model_key
            )

        # Send completion signal
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"

    except Exception as e:
        logger.error(f"Error in {error_context}: {str(e)}")
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Fireworks Chat & Benchmark API", "status": "healthy"}


@app.get("/models")
async def get_available_models():
    """Get all available models"""
    try:
        return {"models": _MODELS}
    except Exception as e:
        logger.error(f"Error getting models: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get available models")


@app.get("/models/{model_key}")
async def get_model_info(model_key: str):
    """Get detailed information about a specific model"""
    try:
        if not validate_model_key(model_key):
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
async def get_session_stats():
    """Get session management statistics"""
    try:
        stats = session_manager.get_session_stats()
        return {"session_stats": stats}
    except Exception as e:
        logger.error(f"Error getting session stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get session statistics")


@app.get("/sessions")
async def list_sessions():
    """List all active sessions"""
    try:
        sessions = session_manager.list_sessions()
        return {"sessions": sessions}
    except Exception as e:
        logger.error(f"Error listing sessions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list sessions")


@app.post("/chat/single")
async def single_chat(request: SingleChatRequest, http_request: Request):
    """Single model streaming - works for both solo and comparison chats"""
    try:
        client_api_key = await get_validated_api_key(http_request)

        if not validate_model_key(request.model_key):
            raise HTTPException(
                status_code=400, detail=f"Invalid model key: {request.model_key}"
            )

        if request.comparison_id:
            session_id = f"{request.comparison_id}_{request.model_key}"
            session_type = "single"  # Each model stream is independent
            primary_id = request.comparison_id
        else:
            session_id = request.conversation_id or generate_session_id()
            session_type = "single"
            primary_id = session_id

        logger.info(
            f"Chat request - Type: {session_type}, Session: {session_id}, "
            f"API key: {get_api_key_safe_for_logging(client_api_key)}"
        )

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
async def stream_metrics(request: MetricsRequest, http_request: Request):
    """Stream live metrics immediately - completely independent of model responses"""
    try:
        client_api_key = await get_validated_api_key(http_request)

        # Validate all model keys
        for model_key in request.model_keys:
            if not validate_model_key(model_key):
                raise HTTPException(
                    status_code=400, detail=f"Invalid model key: {model_key}"
                )

        # Determine prompt for metrics
        prompt = request.prompt
        if not prompt and request.comparison_id:
            # Get prompt from comparison session via service
            prompt = comparison_service.get_comparison_prompt(request.comparison_id)
        elif not prompt:
            prompt = "Hello, world!"

        logger.info(
            f"Starting metrics stream for models: {request.model_keys}, "
            f"concurrency: {request.concurrency}"
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
async def init_comparison(request: ComparisonInitRequest):
    """Initialize a comparison session - lightweight coordination only"""
    try:
        # Validate all model keys
        for model_key in request.model_keys:
            if not validate_model_key(model_key):
                raise HTTPException(
                    status_code=400, detail=f"Invalid model key: {model_key}"
                )

        comparison_id = str(uuid.uuid4())

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
