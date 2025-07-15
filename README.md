# FireChat

A modern chat application for comparing AI model responses, built with Next.js 15 and FastAPI. Compare responses from multiple Fireworks AI models side-by-side with real-time streaming and performance benchmarking.

## Features

- **Single Model Chat**: Interactive chat with individual AI models
- **Model Comparison**: Side-by-side comparison of responses from two models
- **Real-time Streaming**: Server-sent events for live response streaming
- **Performance Benchmarking**: Speed tests and detailed performance metrics
- **Modern UI**: Built with Next.js 15, TypeScript, and shadcn/ui components
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Architecture

This is a full-stack monorepo application:

- **Frontend**: Next.js 15 with App Router, TypeScript, Tailwind CSS
- **Backend**: FastAPI with async streaming support
- **AI Integration**: Fireworks AI models (Qwen3, Llama, DeepSeek)
- **Deployment**: Optimized for Vercel with serverless functions

```
firechat/
├── api/                    # FastAPI backend (Vercel serverless functions)
│   ├── index.py           # Vercel entry point
│   ├── requirements.txt   # Python dependencies
│   ├── configs/           # Model configurations
│   └── src/               # Backend source code
├── app/                   # Next.js App Router pages
├── components/            # React components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and API client
└── types/                 # TypeScript definitions
```

## Development Setup

### Prerequisites

- Node.js 18+ and pnpm
- Python 3.11+
- Fireworks AI API key

### Quick Start

1. **Clone and setup**:
   ```bash
   git clone <your-repo-url>
   cd firechat
   make setup
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Add your FIREWORKS_API_KEY to .env.local
   ```

3. **Start development servers**:
   ```bash
   make dev
   ```

This will start both the Next.js frontend (http://localhost:3000) and FastAPI backend (http://localhost:8000).

### Available Commands

```bash
# Full development setup
make setup          # Install all dependencies and setup environment

# Development
make dev            # Start both frontend and backend in development mode
make dev-frontend   # Start only the frontend
make dev-backend    # Start only the backend

# Building and testing
make build          # Build the frontend for production
make test           # Run backend tests
make lint           # Run frontend linting

# Utilities
make install        # Install/update dependencies
make clean          # Clean up build artifacts and caches
```

## Usage

1. **Single Model Chat**:
   - Select a model from the dropdown
   - Type your message and press Enter
   - Watch the response stream in real-time

2. **Model Comparison**:
   - Switch to "Comparison Mode" in the sidebar
   - Select two different models
   - Send the same message to both models
   - Compare responses side-by-side

3. **Performance Testing**:
   - Enable speed test mode in comparison chat
   - Get detailed metrics on response times and throughput

## Configuration

### Environment Variables

Create `.env.local` with:

```bash
# Required: Fireworks AI API key
FIREWORKS_API_KEY=your_fireworks_api_key_here

# Optional: Custom API URL for development
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Model Configuration

Models are configured in `api/configs/config.yaml`. You can:
- Add new Fireworks AI models
- Adjust default parameters (temperature, max_tokens)
- Configure timeouts and streaming settings

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `FIREWORKS_API_KEY`
3. Deploy automatically on push

The application is configured for Vercel's hybrid deployment:
- Frontend: Static site with SSR capabilities
- Backend: Serverless functions at `/api/*`

### Local Production Build

```bash
make build
pnpm start
```

## API Documentation

When running locally, visit:
- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs
- Backend OpenAPI spec: http://localhost:8000/openapi.json

### Key Endpoints

- `GET /api/models` - List available models
- `POST /api/chat/single` - Single model chat with streaming
- `POST /api/chat/compare` - Compare two models with streaming
- `POST /api/benchmark/*` - Performance benchmarking endpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `make test && make lint`
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Troubleshooting

### Common Issues

**Backend not starting**:
- Check if Python 3.11+ is installed
- Verify FIREWORKS_API_KEY is set
- Run `make clean && make setup`

**Frontend build errors**:
- Clear Node.js cache: `pnpm store prune`
- Reinstall dependencies: `rm -rf node_modules && pnpm install`

**CORS errors in development**:
- Ensure backend is running on port 8000
- Check NEXT_PUBLIC_API_URL in .env.local

**Model not responding**:
- Verify your Fireworks API key is valid
- Check model availability in `api/configs/config.yaml`
- Review backend logs for detailed errors

### Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the API documentation at `/docs`
3. Create an issue in the repository