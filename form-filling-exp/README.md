# PDF Form Filler

A simple app to fill PDF forms using natural language instructions.

**Scope:** This app only works with PDFs that have native AcroForm fields (fillable form fields). It does not support OCR or drawing on non-form PDFs.

## Quick Start

```bash
# 1. Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# 4. Run the server
cd backend
python main.py
```

Then open http://localhost:8000 in your browser.

## Project Structure

```
.
├── backend/
│   ├── main.py           # FastAPI server - API endpoints
│   ├── pdf_processor.py  # Core PDF logic - edit this for PDF processing
│   ├── llm.py            # LLM integration - edit this for prompts/models
│   └── test_local.py     # CLI testing script
├── frontend/
│   └── index.html        # Web UI (single file, no build step)
├── requirements.txt
└── README.md
```

## Editing the Python Files

### `backend/pdf_processor.py`
Core PDF processing logic. Key functions to customize:

- `detect_form_fields(pdf_bytes)` - Detects AcroForm fields in a PDF
- `apply_edits(pdf_bytes, edits)` - Applies field edits to a PDF
- `_extract_nearby_text()` - Controls how context is extracted for each field

**Test directly:**
```bash
cd backend
python pdf_processor.py path/to/your.pdf
```

### `backend/llm.py`
LLM integration using LlamaIndex's Anthropic integration with structured output.

Key functions:
- `map_instructions_to_fields(instructions, fields)` - Uses Claude to parse instructions
- `simple_keyword_mapping()` - No-LLM fallback with simple key:value parsing
- `_build_field_descriptions()` - Formats fields for the LLM prompt

**Configuration:**
- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)
- `ANTHROPIC_MODEL` - Model to use (default: `claude-sonnet-4-5`)

**Available models (structured outputs supported):**
- `claude-sonnet-4-5` - Recommended, fast and capable
- `claude-opus-4-5` - Most capable
- `claude-haiku-4-5` - Fastest

**Test directly:**
```bash
cd backend
ANTHROPIC_API_KEY=sk-ant-xxx python llm.py
```

### `backend/main.py`
FastAPI server. Endpoints:

- `POST /analyze` - Upload PDF, get detected form fields
- `POST /fill` - Fill form fields with natural language, download result
- `POST /fill-preview` - Preview what fields would be filled

## API Usage

### Analyze a PDF
```bash
curl -X POST http://localhost:8000/analyze \
  -F "file=@your-form.pdf"
```

### Fill a PDF
```bash
curl -X POST http://localhost:8000/fill \
  -F "file=@your-form.pdf" \
  -F "instructions=My name is John Doe, email is john@example.com" \
  -o filled.pdf
```

### Fill without LLM (simple keyword matching)
```bash
curl -X POST http://localhost:8000/fill \
  -F "file=@your-form.pdf" \
  -F "instructions=name: John Doe, email: john@example.com" \
  -F "use_llm=false" \
  -o filled.pdf
```

## Using Without Anthropic API

You can use this without an API key by:

1. **Simple keyword matching**: Uncheck "Use AI" in the UI, or pass `use_llm=false`
   - Format instructions as `key: value` pairs
   - e.g., "name: John Doe, email: john@example.com"

2. **Use a different model**: Edit `backend/llm.py` to swap providers. LlamaIndex supports many LLMs:
   - OpenAI: `llama-index-llms-openai`
   - Local models via Ollama: `llama-index-llms-ollama`
   - Together AI: `llama-index-llms-together`
   - See: https://developers.llamaindex.ai/python/framework/understanding/using_llms/

## Anthropic Structured Outputs

This app uses Anthropic's structured outputs beta for reliable JSON parsing via Pydantic models:

```python
import anthropic
from pydantic import BaseModel

class FormEdits(BaseModel):
    edits: list[FieldEdit]

client = anthropic.Anthropic()
response = client.beta.messages.parse(
    model="claude-sonnet-4-5",
    betas=["structured-outputs-2025-11-13"],
    messages=[{"role": "user", "content": prompt}],
    output_format=FormEdits,
)
result = response.parsed_output  # Pydantic model
```

Reference:
- [Anthropic Structured Outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

## Common Issues

**"No fillable form fields found"**
- This app only works with PDFs that have native AcroForm fields
- Many PDFs are flat images or don't have fillable fields
- Try with official government/tax forms - they often have fillable fields

**"ANTHROPIC_API_KEY environment variable is required"**
- Set your API key: `export ANTHROPIC_API_KEY=sk-ant-xxx`
- Or uncheck "Use AI" in the UI to use simple keyword matching

**Fields not being filled correctly**
- Run `/analyze` first to see what fields are detected
- Check the `label_context` to see what text the LLM uses to understand each field
- Adjust your instructions to match the context

## Development

```bash
# Run with auto-reload
cd backend
uvicorn main:app --reload

# Or run directly
python main.py
```

API documentation is available at http://localhost:8000/docs (Swagger UI).
