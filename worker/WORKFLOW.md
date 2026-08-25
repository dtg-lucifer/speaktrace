# Development Workflow

This document outlines the standard development workflow for the Speaktrace AI Worker project.

## 1. Environment Setup

### Prerequisites
- Python ≥ 3.12
- [uv](https://docs.astral.sh/uv/) - Python package manager
- Redis server
- Backend service with `/auth/me` endpoint

### Initial Setup
```bash
# Clone repository
git clone <repository-url>
cd speaktrace/worker

# Install dependencies
uv sync

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# At minimum set:
# GEMINI_API_KEY=your_gemini_key_here
# BACKEND_BASE_URL=http://your-backend-service-url
```

## 2. Development Cycle

### Making Changes
1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes following the code conventions in AGENTS.md
3. Test your changes locally
4. Run linting and type checking: `uv run ruff check && uv run pyright`
5. Commit your changes: `git commit -m "feat: description of changes"`
6. Push to remote: `git push origin feature/your-feature-name`
7. Open a pull request

### Common Tasks

#### Adding a New Tool
1. Add backend method in `app/services/backend_client.py`
2. Add `@tool` function in `app/agent/tools.py` inside `build_tools()`
3. Add specific docstring explaining when to use the tool
4. Add tool to return list in `build_tools()`
5. Test that agent calls it appropriately

#### Adding Context to Agent Runs
1. Add backend method in `backend_client.py`
2. Add to `asyncio.gather` block in `context_builder.py`
3. Add result to returned dict in `context_builder.py`
4. Reference in `build_system_prompt()` in `system_prompt.py`

#### Adding API Endpoints
1. Create route module in `app/api/routes/your_feature.py`
2. Define router with prefix and tags
3. Add endpoints with proper Pydantic models
4. Register router in `app/api/router.py`

## 3. Code Quality

### Linting
Run Ruff for linting:
```bash
uv run ruff check
```

### Type Checking
Run Pyright for type checking:
```bash
uv run pyright
```

### Testing
Run tests (when implemented):
```bash
uv run pytest
```

## 4. Running the Application

### Development Mode
```bash
uv run main.py
```
or
```bash
uv run dev  # if defined in scripts
```

### Production Mode
Using PM2:
```bash
pm2 start ecosystem.config.json
```

## 5. Git Practices

### Commit Messages
Use conventional commits:
- `feat: add new feature`
- `fix: resolve issue`
- `docs: update documentation`
- `refactor: improve code structure`
- `test: add tests`
- `chore: maintenance tasks`

### Branch Naming
- `feature/feature-name` for new features
- `bugfix/bug-description` for bug fixes
- `hotfix/urgent-fix` for production hotfixes
- `release/version-number` for release preparation

## 6. Deployment

### CI/CD Pipeline
The project uses GitHub Actions for CI/CD:
1. Linting and type checking on push
2. Building and testing on pull requests
3. Automatic deployment to staging on merge to main
4. Manual approval required for production deployment

### Manual Deployment
If deploying manually:
1. Ensure all tests pass
2. Tag release: `git tag v1.0.0 && git push --tags`
3. Deploy using PM2: `pm2 reload ecosystem.config.json --update-env`
4. Verify health check: `curl http://localhost:8000/health`

## 7. Troubleshooting

### Common Issues
- **LLM Provider Errors**: Ensure GEMINI_API_KEY is set in .env
- **Redis Connection Errors**: Verify Redis server is running
- **Backend Connection Issues**: Check BACKEND_BASE_URL and backend service status
- **Tool Calling Problems**: Verify tools are properly registered and have correct docstrings

### Logs
- Development: Pretty-printed colored logs to console
- Production: JSON logs via structlog (configured in logger.py)

## 8. Getting Help

- Refer to AGENTS.md for detailed architecture and conventions
- Check docstrings in code for function-specific guidance
- Review existing tools and routes for implementation patterns