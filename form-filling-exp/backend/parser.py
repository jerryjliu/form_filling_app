"""
File parsing module using LlamaParse.

Provides functionality to parse various file types (PDF, PPTX, DOCX, images)
into markdown format for use as context in the form-filling agent.
"""

import os
from pathlib import Path
from typing import AsyncGenerator, Literal

# File extensions that don't need parsing (already text-based)
SIMPLE_TEXT_EXTENSIONS = {
    '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm',
    '.py', '.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.yaml', '.yml',
    '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.sql',
    '.r', '.rb', '.go', '.java', '.c', '.cpp', '.h', '.hpp', '.rs',
}

# File extensions that need LlamaParse
PARSEABLE_EXTENSIONS = {
    '.pdf', '.pptx', '.ppt', '.docx', '.doc', '.xlsx', '.xls',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp',
}

# Parse mode options
ParseMode = Literal["cost_effective", "agentic_plus"]

# Try to import LlamaParse
LLAMAPARSE_AVAILABLE = False
LLAMAPARSE_ERROR = None

try:
    from llama_cloud_services import LlamaParse
    LLAMAPARSE_AVAILABLE = True
except ImportError as e:
    LLAMAPARSE_ERROR = str(e)
    print(f"[Parser] LlamaParse not available: {e}")
    print("[Parser] Install with: pip install llama-cloud-services")


def needs_parsing(filename: str) -> bool:
    """Check if a file needs to be parsed with LlamaParse."""
    ext = Path(filename).suffix.lower()
    return ext in PARSEABLE_EXTENSIONS


def is_simple_text(filename: str) -> bool:
    """Check if a file is simple text that can be read directly."""
    ext = Path(filename).suffix.lower()
    return ext in SIMPLE_TEXT_EXTENSIONS


def get_parser(mode: ParseMode = "cost_effective") -> "LlamaParse":
    """
    Get a LlamaParse instance with the specified mode.

    Args:
        mode: "cost_effective" or "agentic_plus"

    Returns:
        LlamaParse instance configured for the mode
    """
    if not LLAMAPARSE_AVAILABLE:
        raise RuntimeError(f"LlamaParse not available: {LLAMAPARSE_ERROR}")

    common_args = {
        "tier": mode,  # "cost_effective" or "agentic_plus"
        "version": "latest",
        "high_res_ocr": True,
        "adaptive_long_table": True,
        "outlined_table_extraction": True,
        "output_tables_as_HTML": True,
        "precise_bounding_box": True,
    }

    return LlamaParse(**common_args)


async def parse_file(
    file_bytes: bytes,
    filename: str,
    mode: ParseMode = "cost_effective"
) -> str:
    """
    Parse a file and return its markdown content.

    Args:
        file_bytes: The file content as bytes
        filename: The original filename (needed for LlamaParse)
        mode: The parsing mode to use

    Returns:
        Markdown string of the parsed content
    """
    import tempfile

    ext = Path(filename).suffix.lower()

    # If it's a simple text file, just decode and return
    if is_simple_text(filename):
        try:
            return file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            return file_bytes.decode('latin-1')

    # If it doesn't need parsing and isn't simple text, return error
    if not needs_parsing(filename):
        return f"[Unsupported file type: {ext}]"

    # Use LlamaParse
    if not LLAMAPARSE_AVAILABLE:
        raise RuntimeError(f"LlamaParse not available: {LLAMAPARSE_ERROR}")

    parser = get_parser(mode)

    # Write bytes to temp file (LlamaParse API takes file paths)
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        # Parse the file
        result = await parser.aparse(tmp_path)

        # Get markdown from the result
        # The result object has pages with .md attribute
        markdown_parts = []
        for page in result.pages:
            if page.md:
                markdown_parts.append(page.md)

        return "\n\n".join(markdown_parts) if markdown_parts else "[No content extracted]"
    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


async def parse_files_stream(
    files: list[tuple[bytes, str]],
    mode: ParseMode = "cost_effective"
) -> AsyncGenerator[dict, None]:
    """
    Parse multiple files with streaming status updates.

    Args:
        files: List of (file_bytes, filename) tuples
        mode: The parsing mode to use

    Yields:
        Status updates and results as dicts
    """
    total = len(files)
    results = []

    yield {"type": "start", "total": total, "mode": mode}

    for i, (file_bytes, filename) in enumerate(files):
        yield {
            "type": "progress",
            "current": i + 1,
            "total": total,
            "filename": filename,
            "status": "parsing"
        }

        try:
            # Check if file needs parsing
            if is_simple_text(filename):
                yield {
                    "type": "progress",
                    "current": i + 1,
                    "total": total,
                    "filename": filename,
                    "status": "reading_text"
                }
                try:
                    content = file_bytes.decode('utf-8')
                except UnicodeDecodeError:
                    content = file_bytes.decode('latin-1')

                results.append({
                    "filename": filename,
                    "content": content,
                    "parsed": False,
                    "error": None
                })

            elif needs_parsing(filename):
                yield {
                    "type": "progress",
                    "current": i + 1,
                    "total": total,
                    "filename": filename,
                    "status": "llamaparse"
                }

                content = await parse_file(file_bytes, filename, mode)
                results.append({
                    "filename": filename,
                    "content": content,
                    "parsed": True,
                    "error": None
                })

            else:
                ext = Path(filename).suffix.lower()
                results.append({
                    "filename": filename,
                    "content": None,
                    "parsed": False,
                    "error": f"Unsupported file type: {ext}"
                })

            yield {
                "type": "progress",
                "current": i + 1,
                "total": total,
                "filename": filename,
                "status": "complete"
            }

        except Exception as e:
            results.append({
                "filename": filename,
                "content": None,
                "parsed": False,
                "error": str(e)
            })
            yield {
                "type": "progress",
                "current": i + 1,
                "total": total,
                "filename": filename,
                "status": "error",
                "error": str(e)
            }

    yield {
        "type": "complete",
        "results": results,
        "success_count": sum(1 for r in results if r["error"] is None),
        "error_count": sum(1 for r in results if r["error"] is not None)
    }


class ParsedFile:
    """Represents a parsed file with its content."""

    def __init__(
        self,
        filename: str,
        content: str,
        original_bytes: bytes | None = None,
        was_parsed: bool = False
    ):
        self.filename = filename
        self.content = content
        self.original_bytes = original_bytes
        self.was_parsed = was_parsed

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "content": self.content,
            "was_parsed": self.was_parsed,
            # Don't include original_bytes in dict - it's for internal use
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ParsedFile":
        return cls(
            filename=data["filename"],
            content=data["content"],
            was_parsed=data.get("was_parsed", False)
        )
