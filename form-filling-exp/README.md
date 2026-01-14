# PDF Form Filler

An AI-powered application for filling PDF forms using natural language instructions. Built with the Claude Agent SDK and LlamaParse.

## Features

- **Natural Language Form Filling**: Describe what you want to fill, and the AI agent handles the rest
- **Multi-Turn Conversations**: Iteratively refine form edits across multiple messages
- **Context File Upload**: Upload reference documents (PDF, DOCX, PPTX, images) that the agent uses to extract information for filling forms
- **Real-Time Streaming**: Watch the agent's progress as it analyzes and fills your form
- **Session Persistence**: Sessions survive page reloads and server restarts (SQLite + file storage)
- **Dual PDF View**: Toggle between original and filled PDF views

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │ PDF Viewer  │  │ Chat Panel  │  │ Context Files Upload     │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ SSE Streaming
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │ PDF Process │  │ Claude Agent│  │ LlamaParse Integration   │ │
│  │ (PyMuPDF)   │  │ SDK         │  │ (Context File Parsing)   │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
│                         │                                        │
│                         ▼                                        │
│              ┌──────────────────────┐                           │
│              │  Session Manager     │                           │
│              │  (SQLite + Files)    │                           │
│              └──────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Anthropic API key
- LlamaCloud API key (optional, for context file parsing)

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repo-url>
cd form-filling-exp

# Create Python virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd web
npm install
cd ..
```

### 2. Environment Variables

```bash
# Required
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional (for context file parsing with LlamaParse)
export LLAMA_CLOUD_API_KEY=llx-your-key-here
```

### 3. Run the Application

```bash
# Terminal 1: Start the backend
cd backend
python main.py
# Backend runs on http://localhost:8000

# Terminal 2: Start the frontend
cd web
npm run dev
# Frontend runs on http://localhost:3000
```

Open http://localhost:3000 in your browser.

## Project Structure

```
.
├── backend/
│   ├── main.py           # FastAPI server with SSE streaming endpoints
│   ├── agent.py          # Claude Agent SDK integration with MCP tools
│   ├── pdf_processor.py  # PDF field detection and editing (PyMuPDF)
│   ├── parser.py         # LlamaParse integration for context files
│   ├── llm.py            # Structured output LLM for simple fills
│   ├── sessions.db       # SQLite database for session persistence
│   └── sessions_data/    # PDF file storage for sessions
├── web/
│   ├── src/
│   │   ├── app/
│   │   │   └── page.tsx          # Main application page
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx     # Chat interface with agent
│   │   │   ├── ContextFilesUpload.tsx  # Context file upload UI
│   │   │   ├── PdfViewer.tsx     # PDF preview component
│   │   │   └── ...
│   │   └── lib/
│   │       ├── api.ts            # Backend API client
│   │       └── session.ts        # Session persistence helpers
│   └── package.json
├── requirements.txt
└── README.md
```

## Usage

### Basic Form Filling

1. **Upload a PDF**: Drag and drop or click to upload a PDF with fillable form fields
2. **Enter Instructions**: Type natural language instructions like:
   - "My name is John Doe, email john@example.com"
   - "Fill all date fields with today's date"
   - "Check all the boxes"
3. **Watch the Agent**: See real-time progress as the agent analyzes fields and fills them
4. **Download**: Click the download button to get your filled PDF

### Using Context Files

For complex forms, upload reference documents that contain the information to fill:

1. **Upload Context Files**: In the chat panel, upload up to 10 files (PDF, DOCX, PPTX, images, or text files)
2. **Choose Parse Mode**:
   - **Cost Effective**: Faster, lower cost parsing
   - **Agentic Plus**: Higher quality extraction for complex documents
3. **Reference in Instructions**: "Fill the form using the information from my resume"

### Multi-Turn Editing

Continue refining your form across multiple messages:

- "Change the phone number to 555-1234"
- "Uncheck the marketing consent box"
- "Update the address to 456 Oak St"

The agent remembers previous edits and only modifies what you ask.

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analyze` | POST | Analyze PDF and detect form fields |
| `/fill-agent-stream` | POST | Fill form with streaming agent (SSE) |
| `/parse-files` | POST | Parse context files with LlamaParse (SSE) |

### Session Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session/{id}` | GET | Get session info |
| `/session/{id}/pdf` | GET | Get filled PDF bytes |
| `/session/{id}/original-pdf` | GET | Get original PDF bytes |
| `/session/{id}/context-files` | GET | Get parsed context files |

### Utility Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/parse-status` | GET | Check LlamaParse availability |
| `/health` | GET | Health check |
| `/docs` | GET | Swagger API documentation |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `LLAMA_CLOUD_API_KEY` | No | LlamaCloud API key for LlamaParse |

### LlamaParse Modes

| Mode | Description | Best For |
|------|-------------|----------|
| `cost_effective` | Standard parsing with LLM | Most documents |
| `agentic_plus` | Advanced agent-based parsing | Complex layouts, tables |

## Technical Details

### Claude Agent SDK

The application uses the Claude Agent SDK with custom MCP tools for form filling:

- `load_pdf` - Load and analyze a PDF
- `list_all_fields` - Get all form fields
- `search_fields` - Search fields by query
- `set_field` - Stage a field edit
- `commit_edits` - Apply all staged edits

### Session Persistence

Sessions are persisted using:
- **SQLite**: Metadata, applied edits, context files (JSON)
- **File System**: PDF bytes (original and filled)
- **Frontend localStorage**: Session ID mapping

### Supported File Types

**Form PDFs**: Must have native AcroForm fields (fillable fields)

**Context Files**:
- Documents: PDF, DOCX, PPTX, DOC, PPT, XLSX, XLS
- Images: PNG, JPG, JPEG, GIF, BMP, TIFF, WEBP
- Text: TXT, MD, CSV, JSON, XML, HTML, and code files

## Limitations

- Only works with PDFs that have native AcroForm fields
- Does not support OCR or drawing on flat PDFs
- Context file parsing requires LlamaCloud API key

## Development

```bash
# Run backend with auto-reload
cd backend
uvicorn main:app --reload --port 8000

# Run frontend with hot-reload
cd web
npm run dev

# Build frontend for production
cd web
npm run build
```

## License

MIT
