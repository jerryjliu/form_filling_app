# PDF Form Filler by LlamaIndex

An AI-powered application that fills PDF forms using natural language instructions. Built with the Claude Agent SDK, LlamaParse, and a modern React frontend.

## Overview

This repository contains a full-stack application for intelligent PDF form filling:

- **Backend**: Python FastAPI server with Claude Agent SDK and custom MCP tools
- **Frontend**: Next.js 16 + React 19 with real-time streaming UI
- **PDF Processing**: PyMuPDF for form field detection and editing
- **Document Parsing**: LlamaParse for extracting context from uploaded files

## Key Features

- Natural language form filling ("Fill in my name as John Doe")
- Multi-turn conversations for iterative refinement
- Context file upload (PDF, DOCX, PPTX, images) to extract information
- Real-time streaming progress via Server-Sent Events
- Session persistence across page reloads
- Dual PDF view (original vs. filled)

## Quick Start

```bash
# Navigate to the main application
cd form-filling-exp

# Setup Python backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Setup frontend
cd web && npm install && cd ..

# Set required API key
export ANTHROPIC_API_KEY=sk-ant-your-key

# Run backend (Terminal 1)
cd backend && python main.py

# Run frontend (Terminal 2)
cd web && npm run dev
```

Open http://localhost:3000 in your browser.

## Repository Structure

```
.
├── form-filling-exp/     # Main application
│   ├── backend/          # FastAPI + Claude Agent SDK
│   ├── web/              # Next.js frontend
│   ├── requirements.txt  # Python dependencies
│   └── README.md         # Detailed documentation
├── plans/                # Implementation plans
├── research/             # Research documentation
└── README.md             # This file
```

## Requirements

- Python 3.10+
- Node.js 18+
- Anthropic API key (required)
- LlamaCloud API key (optional, for context file parsing)

## Documentation

See [form-filling-exp/README.md](form-filling-exp/README.md) for detailed documentation including:

- Full setup instructions
- API endpoint reference
- Configuration options
- Technical details

## License

MIT
