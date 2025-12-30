"""
Agent-based form filling using the Claude Agent SDK.

Uses ClaudeSDKClient with custom tools defined via @tool decorator.

Reference:
- https://platform.claude.com/docs/en/agent-sdk/overview
- https://platform.claude.com/docs/en/agent-sdk/python

Install:
    pip install claude-agent-sdk
"""

import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any

# Try to import the Claude Agent SDK
try:
    from claude_agent_sdk import (
        ClaudeSDKClient,
        ClaudeAgentOptions,
        tool,
        create_sdk_mcp_server,
        AssistantMessage,
        UserMessage,
        SystemMessage,
        ResultMessage,
        TextBlock,
        ToolUseBlock,
        ToolResultBlock,
    )
    AGENT_SDK_AVAILABLE = True
    AGENT_SDK_ERROR = None
    print("[Agent] Claude Agent SDK loaded successfully")
except ImportError as e:
    AGENT_SDK_AVAILABLE = False
    AGENT_SDK_ERROR = (
        f"{e}. "
        "Install with: pip install claude-agent-sdk"
    )
    ClaudeSDKClient = None
    ClaudeAgentOptions = None
    tool = None
    create_sdk_mcp_server = None
    AssistantMessage = None
    UserMessage = None
    SystemMessage = None
    ResultMessage = None
    TextBlock = None
    ToolUseBlock = None
    ToolResultBlock = None
    print(f"[Agent] WARNING: Claude Agent SDK not available: {e}")
    print("[Agent] Install with: pip install claude-agent-sdk")

# Import PDF processing
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

from pdf_processor import detect_form_fields, DetectedField, FieldType


# ============================================================================
# Session State (shared between tools)
# ============================================================================

import threading
import uuid
from contextvars import ContextVar

class FormFillingSession:
    """Holds state for a form-filling session."""
    def __init__(self, session_id: str | None = None):
        self.session_id = session_id or str(uuid.uuid4())
        self.doc = None
        self.pdf_path: str | None = None
        self.output_path: str | None = None
        self.fields: list[DetectedField] = []
        self.pending_edits: dict[str, Any] = {}
        self.applied_edits: dict[str, Any] = {}
        # Track the current filled PDF bytes for multi-turn
        self.current_pdf_bytes: bytes | None = None
        # Track the original (unfilled) PDF bytes for toggling views
        self.original_pdf_bytes: bytes | None = None
        # Track if this is a continuation
        self.is_continuation: bool = False

    def reset(self):
        """Reset session state for a new form filling operation."""
        if self.doc:
            self.doc.close()
        self.doc = None
        self.pdf_path = None
        self.output_path = None
        self.fields = []
        self.pending_edits = {}
        self.applied_edits = {}
        self.current_pdf_bytes = None
        self.original_pdf_bytes = None
        self.is_continuation = False

    def soft_reset(self):
        """Reset for a new turn but preserve the filled PDF state."""
        # Keep doc, fields, and current_pdf_bytes
        self.pending_edits = {}
        # Don't clear applied_edits - we want to track cumulative changes


import sqlite3
import time
from pathlib import Path as PathlibPath

# Database path - stored in backend directory
_DB_PATH = PathlibPath(__file__).parent / "sessions.db"
# Directory for storing session PDF files (cheaper than BLOB in SQLite)
_SESSIONS_DATA_DIR = PathlibPath(__file__).parent / "sessions_data"


class SessionManager:
    """
    Thread-safe manager for multiple concurrent user sessions with SQLite persistence.

    Sessions are identified by a unique session_id (UUID string).
    State is persisted to SQLite so sessions survive server restarts.

    Note: PDF document handles (fitz.Document) are NOT persisted - they are
    re-opened from stored PDF bytes when needed.
    """
    def __init__(self, db_path: str | PathlibPath | None = None, data_dir: str | PathlibPath | None = None):
        self._sessions: dict[str, FormFillingSession] = {}
        self._lock = threading.Lock()
        self._db_path = str(db_path or _DB_PATH)
        self._data_dir = PathlibPath(data_dir or _SESSIONS_DATA_DIR)
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._load_sessions_from_db()

    def _init_db(self):
        """Initialize the SQLite database schema."""
        with sqlite3.connect(self._db_path) as conn:
            # Check if we need to migrate from old schema (with pdf_bytes BLOB)
            cursor = conn.execute("PRAGMA table_info(sessions)")
            columns = {row[1] for row in cursor.fetchall()}

            if not columns:
                # Fresh install - create new schema
                conn.execute("""
                    CREATE TABLE sessions (
                        session_id TEXT PRIMARY KEY,
                        pdf_path TEXT,
                        output_path TEXT,
                        applied_edits TEXT,
                        pdf_file_path TEXT,
                        original_pdf_file_path TEXT,
                        created_at REAL,
                        updated_at REAL
                    )
                """)
            elif 'pdf_bytes' in columns and 'pdf_file_path' not in columns:
                # Migration: add pdf_file_path column, migrate data, drop pdf_bytes
                print("[SessionManager] Migrating database schema...")
                conn.execute("ALTER TABLE sessions ADD COLUMN pdf_file_path TEXT")

                # Migrate existing BLOB data to files
                cursor = conn.execute("SELECT session_id, pdf_bytes FROM sessions WHERE pdf_bytes IS NOT NULL")
                for row in cursor.fetchall():
                    session_id, pdf_bytes = row
                    if pdf_bytes:
                        file_path = self._data_dir / f"{session_id}.pdf"
                        file_path.write_bytes(pdf_bytes)
                        conn.execute(
                            "UPDATE sessions SET pdf_file_path = ?, pdf_bytes = NULL WHERE session_id = ?",
                            (str(file_path), session_id)
                        )
                print("[SessionManager] Migration complete")

            # Add original_pdf_file_path column if it doesn't exist
            if 'original_pdf_file_path' not in columns and columns:
                try:
                    conn.execute("ALTER TABLE sessions ADD COLUMN original_pdf_file_path TEXT")
                    print("[SessionManager] Added original_pdf_file_path column")
                except sqlite3.OperationalError:
                    pass  # Column already exists

            conn.commit()
        print(f"[SessionManager] Database initialized at: {self._db_path}")
        print(f"[SessionManager] PDF storage directory: {self._data_dir}")

    def _load_sessions_from_db(self):
        """Load existing sessions from the database on startup."""
        try:
            with sqlite3.connect(self._db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute("SELECT * FROM sessions")
                rows = cursor.fetchall()

                for row in rows:
                    session = FormFillingSession(row['session_id'])
                    session.pdf_path = row['pdf_path']
                    session.output_path = row['output_path']

                    # Load filled PDF bytes from file if available
                    pdf_file_path = row['pdf_file_path'] if 'pdf_file_path' in row.keys() else None
                    if pdf_file_path:
                        file_path = PathlibPath(pdf_file_path)
                        if file_path.exists():
                            session.current_pdf_bytes = file_path.read_bytes()

                    # Load original PDF bytes from file if available
                    original_pdf_file_path = row['original_pdf_file_path'] if 'original_pdf_file_path' in row.keys() else None
                    if original_pdf_file_path:
                        file_path = PathlibPath(original_pdf_file_path)
                        if file_path.exists():
                            session.original_pdf_bytes = file_path.read_bytes()

                    # Parse applied_edits JSON
                    if row['applied_edits']:
                        try:
                            session.applied_edits = json.loads(row['applied_edits'])
                        except json.JSONDecodeError:
                            session.applied_edits = {}

                    self._sessions[session.session_id] = session

                print(f"[SessionManager] Loaded {len(rows)} sessions from database")
        except Exception as e:
            print(f"[SessionManager] Error loading sessions: {e}")

    def _save_session_to_db(self, session: FormFillingSession):
        """Save a session to the database (PDF bytes saved to file)."""
        try:
            # Save filled PDF bytes to file if present
            pdf_file_path = None
            if session.current_pdf_bytes:
                pdf_file_path = self._data_dir / f"{session.session_id}.pdf"
                pdf_file_path.write_bytes(session.current_pdf_bytes)
                pdf_file_path = str(pdf_file_path)

            # Save original PDF bytes to file if present
            original_pdf_file_path = None
            if session.original_pdf_bytes:
                original_pdf_file_path = self._data_dir / f"{session.session_id}_original.pdf"
                original_pdf_file_path.write_bytes(session.original_pdf_bytes)
                original_pdf_file_path = str(original_pdf_file_path)

            with sqlite3.connect(self._db_path) as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO sessions
                    (session_id, pdf_path, output_path, applied_edits, pdf_file_path, original_pdf_file_path, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM sessions WHERE session_id = ?), ?), ?)
                """, (
                    session.session_id,
                    session.pdf_path,
                    session.output_path,
                    json.dumps(session.applied_edits) if session.applied_edits else None,
                    pdf_file_path,
                    original_pdf_file_path,
                    session.session_id,  # For the COALESCE subquery
                    time.time(),  # created_at (only used if new)
                    time.time(),  # updated_at
                ))
                conn.commit()
        except Exception as e:
            print(f"[SessionManager] Error saving session {session.session_id}: {e}")

    def _delete_session_from_db(self, session_id: str):
        """Delete a session from the database and its PDF files."""
        try:
            # Delete filled PDF file if it exists
            pdf_file_path = self._data_dir / f"{session_id}.pdf"
            if pdf_file_path.exists():
                pdf_file_path.unlink()

            # Delete original PDF file if it exists
            original_pdf_file_path = self._data_dir / f"{session_id}_original.pdf"
            if original_pdf_file_path.exists():
                original_pdf_file_path.unlink()

            with sqlite3.connect(self._db_path) as conn:
                conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
                conn.commit()
        except Exception as e:
            print(f"[SessionManager] Error deleting session {session_id}: {e}")

    def create_session(self, session_id: str | None = None) -> FormFillingSession:
        """Create a new session with optional specified ID."""
        session = FormFillingSession(session_id)
        with self._lock:
            self._sessions[session.session_id] = session
        self._save_session_to_db(session)
        print(f"[SessionManager] Created session: {session.session_id}")
        return session

    def get_session(self, session_id: str) -> FormFillingSession | None:
        """Get an existing session by ID."""
        with self._lock:
            return self._sessions.get(session_id)

    def get_or_create_session(self, session_id: str | None = None) -> FormFillingSession:
        """Get existing session or create a new one."""
        if session_id:
            with self._lock:
                if session_id in self._sessions:
                    print(f"[SessionManager] Retrieved existing session: {session_id}")
                    return self._sessions[session_id]
        return self.create_session(session_id)

    def save_session(self, session: FormFillingSession):
        """Explicitly save session state to database."""
        self._save_session_to_db(session)

    def delete_session(self, session_id: str) -> bool:
        """Delete a session and clean up resources."""
        with self._lock:
            if session_id in self._sessions:
                session = self._sessions[session_id]
                session.reset()  # Clean up doc, etc.
                del self._sessions[session_id]
                self._delete_session_from_db(session_id)
                print(f"[SessionManager] Deleted session: {session_id}")
                return True
        return False

    def cleanup_old_sessions(self, max_age_seconds: int = 3600):
        """
        Clean up sessions older than max_age_seconds.
        Call this periodically in production to prevent database bloat.
        """
        cutoff_time = time.time() - max_age_seconds
        try:
            with sqlite3.connect(self._db_path) as conn:
                # Get old session IDs
                cursor = conn.execute(
                    "SELECT session_id FROM sessions WHERE updated_at < ?",
                    (cutoff_time,)
                )
                old_sessions = [row[0] for row in cursor.fetchall()]

                # Delete PDF files (both filled and original)
                for sid in old_sessions:
                    pdf_file_path = self._data_dir / f"{sid}.pdf"
                    if pdf_file_path.exists():
                        pdf_file_path.unlink()
                    original_pdf_file_path = self._data_dir / f"{sid}_original.pdf"
                    if original_pdf_file_path.exists():
                        original_pdf_file_path.unlink()

                # Delete from database
                conn.execute(
                    "DELETE FROM sessions WHERE updated_at < ?",
                    (cutoff_time,)
                )
                conn.commit()

                # Remove from memory
                with self._lock:
                    for sid in old_sessions:
                        if sid in self._sessions:
                            self._sessions[sid].reset()
                            del self._sessions[sid]

                if old_sessions:
                    print(f"[SessionManager] Cleaned up {len(old_sessions)} old sessions")

        except Exception as e:
            print(f"[SessionManager] Error during cleanup: {e}")

    def get_session_pdf_bytes(self, session_id: str) -> bytes | None:
        """Get the filled PDF bytes for a session (for API retrieval)."""
        session = self.get_session(session_id)
        if session and session.current_pdf_bytes:
            return session.current_pdf_bytes
        return None

    def get_session_original_pdf_bytes(self, session_id: str) -> bytes | None:
        """Get the original (unfilled) PDF bytes for a session (for API retrieval)."""
        session = self.get_session(session_id)
        if session and session.original_pdf_bytes:
            return session.original_pdf_bytes
        return None


# Global session manager (replaces the singleton _session)
_session_manager = SessionManager()

# Context variable to track current session in async context
# This allows tools to access the session without passing it explicitly
_current_session: ContextVar[FormFillingSession | None] = ContextVar('current_session', default=None)


def get_current_session() -> FormFillingSession | None:
    """Get the current session from context (used by tools)."""
    return _current_session.get()


def set_current_session(session: FormFillingSession | None):
    """Set the current session in context."""
    _current_session.set(session)




# ============================================================================
# Tool Definitions (using @tool decorator)
# ============================================================================

if AGENT_SDK_AVAILABLE:

    @tool("load_pdf", "Load a PDF file for form filling", {"pdf_path": str})
    async def tool_load_pdf(args: dict[str, Any]) -> dict[str, Any]:
        """Load a PDF and detect its form fields."""
        session = get_current_session()
        if not session:
            return {"content": [{"type": "text", "text": '{"error": "No active session"}'}]}

        pdf_path = args["pdf_path"]
        print(f"[load_pdf] Loading: {pdf_path} (session: {session.session_id})")
        try:
            session.doc = fitz.open(pdf_path)
            session.pdf_path = pdf_path

            with open(pdf_path, 'rb') as f:
                pdf_bytes = f.read()
            session.fields = detect_form_fields(pdf_bytes)
            session.pending_edits = {}
            # Don't clear applied_edits if this is a continuation
            if not session.is_continuation:
                session.applied_edits = {}

            result = {
                "success": True,
                "message": f"Loaded PDF with {len(session.fields)} form fields",
                "field_count": len(session.fields)
            }
            print(f"[load_pdf] Success: {len(session.fields)} fields found")
        except Exception as e:
            result = {"success": False, "error": str(e)}
            print(f"[load_pdf] Error: {e}")

        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}

    @tool("list_all_fields", "List all form fields in the loaded PDF", {})
    async def tool_list_all_fields(args: dict[str, Any]) -> dict[str, Any]:
        """List all detected form fields."""
        session = get_current_session()
        if not session or not session.doc:
            return {"content": [{"type": "text", "text": '{"error": "No PDF loaded. Call load_pdf first."}'}]}

        fields = []
        for f in session.fields:
            field_info = {
                "field_id": f.field_id,
                "type": f.field_type.value,
                "page": f.page,
                "label_context": f.label_context[:100],
                "has_options": f.options is not None,
            }
            # Include current value if the field has been filled
            if f.field_id in session.applied_edits:
                field_info["current_value"] = session.applied_edits[f.field_id]
            elif f.current_value:
                field_info["current_value"] = f.current_value
            fields.append(field_info)

        return {"content": [{"type": "text", "text": json.dumps(fields, indent=2)}]}

    @tool("search_fields", "Search for fields matching a query", {"query": str})
    async def tool_search_fields(args: dict[str, Any]) -> dict[str, Any]:
        """Search fields by label context."""
        session = get_current_session()
        if not session or not session.doc:
            return {"content": [{"type": "text", "text": '{"error": "No PDF loaded."}'}]}

        query = args["query"].lower()
        results = []

        for f in session.fields:
            context_lower = f.label_context.lower()
            if query in context_lower or any(word in context_lower for word in query.split()):
                field_info = {
                    "field_id": f.field_id,
                    "type": f.field_type.value,
                    "page": f.page,
                    "label_context": f.label_context[:150],
                    "options": f.options,
                }
                # Include current value if set
                if f.field_id in session.applied_edits:
                    field_info["current_value"] = session.applied_edits[f.field_id]
                results.append(field_info)

        return {"content": [{"type": "text", "text": json.dumps(results[:10], indent=2)}]}

    @tool("get_field_details", "Get detailed info about a specific field", {"field_id": str})
    async def tool_get_field_details(args: dict[str, Any]) -> dict[str, Any]:
        """Get full details about a field."""
        session = get_current_session()
        if not session or not session.doc:
            return {"content": [{"type": "text", "text": '{"error": "No PDF loaded."}'}]}

        field_id = args["field_id"]
        field = next((f for f in session.fields if f.field_id == field_id), None)

        if not field:
            return {"content": [{"type": "text", "text": f'{{"error": "Field not found: {field_id}"}}'}]}

        result = {
            "field_id": field.field_id,
            "type": field.field_type.value,
            "page": field.page,
            "label_context": field.label_context,
            "options": field.options,
            "pending_value": session.pending_edits.get(field_id),
            "current_value": session.applied_edits.get(field_id) or field.current_value,
        }
        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}

    @tool("set_field", "Stage a value for a field (call commit_edits to apply)", {"field_id": str, "value": str})
    async def tool_set_field(args: dict[str, Any]) -> dict[str, Any]:
        """Stage a field edit."""
        session = get_current_session()
        print(f"[set_field] Called with: {args}")
        if not session or not session.doc:
            return {"content": [{"type": "text", "text": '{"error": "No PDF loaded."}'}]}

        field_id = args["field_id"]
        value = args["value"]

        field = next((f for f in session.fields if f.field_id == field_id), None)
        if not field:
            print(f"[set_field] Field not found: {field_id}")
            return {"content": [{"type": "text", "text": f'{{"error": "Field not found: {field_id}"}}'}]}

        # Handle boolean for checkboxes
        if field.field_type == FieldType.CHECKBOX:
            if isinstance(value, str):
                value = value.lower() in ('true', 'yes', '1', 'checked')

        session.pending_edits[field_id] = value
        print(f"[set_field] Staged: {field_id} = {value} (total pending: {len(session.pending_edits)})")

        result = {
            "success": True,
            "field_id": field_id,
            "value": value,
            "pending_count": len(session.pending_edits)
        }
        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}

    @tool("get_pending_edits", "Review all staged edits before committing", {})
    async def tool_get_pending_edits(args: dict[str, Any]) -> dict[str, Any]:
        """Get all pending edits."""
        session = get_current_session()
        if not session:
            return {"content": [{"type": "text", "text": '{"error": "No active session"}'}]}

        edits = []
        for field_id, value in session.pending_edits.items():
            field = next((f for f in session.fields if f.field_id == field_id), None)
            edits.append({
                "field_id": field_id,
                "value": value,
                "label_context": field.label_context[:80] if field else "unknown",
                "type": field.field_type.value if field else "unknown",
            })

        result = {"pending_edits": edits, "count": len(edits)}
        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}

    @tool(
        "commit_edits",
        "Apply all staged edits and save the PDF. Output path is optional - uses default if not provided.",
        {
            "type": "object",
            "properties": {
                "output_path": {"type": "string", "description": "Path to save the filled PDF (optional)"}
            },
            "required": []
        }
    )
    async def tool_commit_edits(args: dict[str, Any]) -> dict[str, Any]:
        """Apply edits and save."""
        session = get_current_session()
        print(f"[commit_edits] Called with args: {args}")
        if not session:
            return {"content": [{"type": "text", "text": '{"error": "No active session"}'}]}

        print(f"[commit_edits] Session output_path: {session.output_path}")
        print(f"[commit_edits] Pending edits: {len(session.pending_edits)}")

        if not session.doc:
            return {"content": [{"type": "text", "text": '{"error": "No PDF loaded."}'}]}

        output_path = args.get("output_path") or session.output_path
        if not output_path:
            output_path = session.pdf_path.replace('.pdf', '_filled.pdf')

        print(f"[commit_edits] Saving to: {output_path}")

        applied = []
        errors = []

        for field_id, value in session.pending_edits.items():
            field = next((f for f in session.fields if f.field_id == field_id), None)
            if not field:
                errors.append(f"Field not found: {field_id}")
                continue

            try:
                page = session.doc[field.page]
                for widget in page.widgets():
                    widget_field_id = f"page{field.page}_{widget.field_name}"
                    if widget_field_id == field_id:
                        if field.field_type == FieldType.CHECKBOX:
                            widget.field_value = bool(value)
                        else:
                            widget.field_value = str(value)
                        widget.update()
                        applied.append({"field_id": field_id, "value": value})
                        session.applied_edits[field_id] = value
                        print(f"[commit_edits] Applied: {field_id} = {value}")
                        break
            except Exception as e:
                errors.append(f"Failed to apply {field_id}: {str(e)}")
                print(f"[commit_edits] Error: {e}")

        # Save
        try:
            session.doc.save(output_path)
            print(f"[commit_edits] Saved successfully to: {output_path}")

            # Store the filled PDF bytes for multi-turn
            with open(output_path, 'rb') as f:
                session.current_pdf_bytes = f.read()

            # Verify file was created
            import os
            if os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                print(f"[commit_edits] File verified: {file_size} bytes")
            else:
                print(f"[commit_edits] WARNING: File not found after save!")
                errors.append("File not created after save")
        except Exception as e:
            print(f"[commit_edits] Save error: {e}")
            errors.append(f"Save failed: {str(e)}")

        session.pending_edits.clear()

        result = {
            "success": len(errors) == 0,
            "applied": applied,
            "applied_count": len(applied),
            "total_fields_filled": len(session.applied_edits),
            "errors": errors,
            "output_path": output_path
        }
        print(f"[commit_edits] Result: {result}")
        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}

    # Create the list of tools
    FORM_TOOLS = [
        tool_load_pdf,
        tool_list_all_fields,
        tool_search_fields,
        tool_get_field_details,
        tool_set_field,
        tool_get_pending_edits,
        tool_commit_edits,
    ]
else:
    FORM_TOOLS = []


# ============================================================================
# Agent Configuration
# ============================================================================

SYSTEM_PROMPT = """You are a form-filling agent. Your job is to fill out PDF forms based on user instructions.

## Available Tools:
- load_pdf: Load a PDF file
- list_all_fields: See all form fields (includes current values if already filled)
- search_fields: Find fields matching a query
- get_field_details: Get details about a specific field
- set_field: Stage a value for a field
- get_pending_edits: Review staged edits
- commit_edits: Apply all edits and save

## Workflow:
1. Call load_pdf with the PDF path
2. Call list_all_fields to see all fields (and their current values if this is a continuation)
3. For each value to fill or update:
   a. Search for the matching field if needed
   b. Call set_field to stage the edit
4. Call get_pending_edits to review
5. Call commit_edits with the output path to save

## IMPORTANT - Parallel Tool Use:
For maximum efficiency, when you need to set multiple fields, call set_field for ALL of them simultaneously in parallel rather than one at a time. This dramatically speeds up form filling.

Example: If filling name, email, and phone, make 3 parallel set_field calls at once, not 3 sequential calls.

## Multi-Turn Editing:
When continuing from a previous session:
- The PDF path provided is the ALREADY FILLED form from the previous turn
- Fields will show their current_value from previous edits
- Only modify the specific fields the user mentions
- Don't re-fill fields that were already correctly filled unless asked

## Rules:
- For dropdowns, use exact option values
- For checkboxes, use "true" or "false"
- Always review with get_pending_edits before committing
- ALWAYS use parallel tool calls when setting multiple fields
- When continuing, preserve existing values unless explicitly asked to change them
"""

CONTINUATION_SYSTEM_PROMPT = """You are a form-filling agent continuing a multi-turn conversation.

## Context:
- The user has ALREADY filled out this form in a previous turn
- The PDF you're loading contains the PREVIOUSLY FILLED values
- You should ONLY modify the fields the user specifically asks about
- All other fields should remain unchanged

## Available Tools:
- load_pdf: Load the already-filled PDF
- list_all_fields: See all fields WITH their current values
- search_fields: Find fields matching a query
- get_field_details: Get details about a specific field (shows current value)
- set_field: Stage a new value for a field
- get_pending_edits: Review staged edits
- commit_edits: Apply changes and save

## Workflow for Continuation:
1. Load the PDF (it already has previous values)
2. List fields to see what's currently filled
3. ONLY set_field for the specific fields the user wants to change
4. Review and commit

## CRITICAL:
- Do NOT re-set fields that the user didn't ask to change
- The form already has values - you're making INCREMENTAL updates
- Only modify what the user explicitly requests
"""


def _create_agent_options(
    session: FormFillingSession,
    output_path: str | None = None,
    is_continuation: bool = False,
    resume_session_id: str | None = None,
) -> "ClaudeAgentOptions":
    """
    Create agent options with form-filling tools.

    Args:
        session: The FormFillingSession for this request
        output_path: Where to save the filled PDF
        is_continuation: Whether this is a follow-up message in a conversation
        resume_session_id: Session ID from previous turn to resume conversation context
    """
    # Store output path in session for tools to access
    session.output_path = output_path
    session.is_continuation = is_continuation

    # Create in-process MCP server with our tools
    form_server = create_sdk_mcp_server(
        name="form-filler",
        version="1.0.0",
        tools=FORM_TOOLS
    )

    # Use different system prompt for continuations
    system_prompt = CONTINUATION_SYSTEM_PROMPT if is_continuation else SYSTEM_PROMPT

    return ClaudeAgentOptions(
        system_prompt=system_prompt,
        mcp_servers={"forms": form_server},
        allowed_tools=[
            "mcp__forms__load_pdf",
            "mcp__forms__list_all_fields",
            "mcp__forms__search_fields",
            "mcp__forms__get_field_details",
            "mcp__forms__set_field",
            "mcp__forms__get_pending_edits",
            "mcp__forms__commit_edits",
        ],
        # Resume from previous session to maintain conversation context
        resume=resume_session_id,
    )


def _serialize_message(message) -> dict:
    """Convert an agent message to a JSON-serializable dict with user-friendly info."""
    msg_dict = {"type": "unknown"}

    # Check message type
    if AssistantMessage and isinstance(message, AssistantMessage):
        msg_dict["type"] = "assistant"
        texts = []
        tool_calls = []

        for block in message.content:
            if TextBlock and isinstance(block, TextBlock):
                texts.append(block.text)
            elif ToolUseBlock and isinstance(block, ToolUseBlock):
                tool_name = getattr(block, "name", "unknown")
                tool_input = getattr(block, "input", {})

                # Create user-friendly description based on tool
                friendly_desc = _get_friendly_tool_description(tool_name, tool_input)

                tool_calls.append({
                    "name": tool_name,
                    "input": tool_input if isinstance(tool_input, dict) else str(tool_input)[:200],
                    "friendly": friendly_desc
                })

        if texts:
            msg_dict["text"] = " ".join(texts)
        if tool_calls:
            msg_dict["tool_calls"] = tool_calls
            msg_dict["type"] = "tool_use"
            # Add combined friendly message for multiple parallel calls
            friendly_msgs = [tc["friendly"] for tc in tool_calls if tc.get("friendly")]
            if friendly_msgs:
                msg_dict["friendly"] = friendly_msgs

    elif UserMessage and isinstance(message, UserMessage):
        msg_dict["type"] = "user"
        # Try to parse tool results for user-friendly display
        if hasattr(message, "content"):
            content = message.content
            msg_dict["content"] = str(content)[:500]
            # Check if this is a tool result with useful info
            friendly = _parse_tool_result_friendly(content)
            if friendly:
                msg_dict["friendly"] = friendly

    elif SystemMessage and isinstance(message, SystemMessage):
        msg_dict["type"] = "system"
        if hasattr(message, "content"):
            msg_dict["content"] = str(message.content)[:500]
    elif hasattr(message, "type"):
        msg_dict["type"] = str(message.type)

    # Extract common attributes
    for attr in ["text", "name", "result"]:
        if attr not in msg_dict and hasattr(message, attr):
            val = getattr(message, attr)
            if isinstance(val, str):
                msg_dict[attr] = val[:500]
            elif val is not None:
                msg_dict[attr] = str(val)[:500]

    return msg_dict


def _get_friendly_tool_description(tool_name: str, tool_input: dict) -> str:
    """Convert a tool call into a user-friendly description."""
    if not isinstance(tool_input, dict):
        return None

    if tool_name == "mcp__forms__load_pdf" or tool_name == "load_pdf":
        return "Loading PDF document..."

    elif tool_name == "mcp__forms__list_all_fields" or tool_name == "list_all_fields":
        return "Scanning form fields..."

    elif tool_name == "mcp__forms__search_fields" or tool_name == "search_fields":
        query = tool_input.get("query", "")
        return f"Searching for '{query}' fields..."

    elif tool_name == "mcp__forms__get_field_details" or tool_name == "get_field_details":
        field_id = tool_input.get("field_id", "")
        return f"Checking field details..."

    elif tool_name == "mcp__forms__set_field" or tool_name == "set_field":
        field_id = tool_input.get("field_id", "")
        value = tool_input.get("value", "")

        # Try to get a friendly field name from session
        field_label = _get_field_label(field_id)

        # Make value preview shorter for display
        value_preview = str(value)[:25] + "..." if len(str(value)) > 25 else str(value)

        if field_label:
            return f"**{field_label}**: '{value_preview}'"
        else:
            return f"Setting field to '{value_preview}'"

    elif tool_name == "mcp__forms__get_pending_edits" or tool_name == "get_pending_edits":
        return "Reviewing changes..."

    elif tool_name == "mcp__forms__commit_edits" or tool_name == "commit_edits":
        return "Saving filled form..."

    return None


def _get_field_label(field_id: str) -> str:
    """Get a user-friendly label for a field from the session."""
    session = get_current_session()
    if not session or not session.fields:
        return None

    field = next((f for f in session.fields if f.field_id == field_id), None)
    if not field:
        return None

    # Use the native field name if available (cleanest option)
    if field.native_field_name:
        return _format_field_name(field.native_field_name)

    # Fallback: extract from field_id (format: page0_fieldname)
    if "_" in field_id:
        raw_name = field_id.split("_", 1)[1]
        return _format_field_name(raw_name)

    return None


def _format_field_name(name: str) -> str:
    """Convert a raw field name into a user-friendly label."""
    if not name:
        return None

    # Common patterns in PDF form field names
    # e.g., "topmostSubform[0].Page1[0].LastName[0]" -> "Last Name"
    # e.g., "Text1" -> "Text 1"
    # e.g., "claimant_last_name" -> "Claimant Last Name"

    # Extract the last meaningful part if it's a path
    if "." in name:
        name = name.split(".")[-1]

    # Remove array indices like [0]
    name = re.sub(r'\[\d+\]', '', name)

    # Remove common prefixes
    prefixes_to_remove = ['txt', 'fld', 'field', 'text', 'chk', 'checkbox', 'radio', 'rb', 'cb']
    name_lower = name.lower()
    for prefix in prefixes_to_remove:
        if name_lower.startswith(prefix) and len(name) > len(prefix):
            # Check if next char is uppercase or digit (indicating it's a prefix)
            rest = name[len(prefix):]
            if rest[0].isupper() or rest[0].isdigit() or rest[0] == '_':
                name = rest
                break

    # Convert camelCase or PascalCase to spaces
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)

    # Convert underscores to spaces
    name = name.replace('_', ' ')

    # Clean up multiple spaces and strip
    name = ' '.join(name.split())

    # Title case
    name = name.title()

    # Limit length
    if len(name) > 30:
        name = name[:30].rsplit(' ', 1)[0]

    return name if name else None


def _parse_tool_result_friendly(content) -> str:
    """Try to extract user-friendly info from tool results."""
    try:
        # Content might be a list of blocks
        if isinstance(content, list):
            for item in content:
                if hasattr(item, "content"):
                    text = item.content
                    if isinstance(text, str):
                        data = json.loads(text)
                        return _format_tool_result(data)
        elif isinstance(content, str):
            data = json.loads(content)
            return _format_tool_result(data)
    except:
        pass
    return None


def _format_tool_result(data: dict) -> str:
    """Format tool result data into user-friendly text."""
    if not isinstance(data, dict):
        return None

    # PDF loaded
    if "field_count" in data and "success" in data:
        count = data.get("field_count", 0)
        return f"Found {count} form fields"

    # Field set
    if "field_id" in data and "value" in data and "pending_count" in data:
        value = str(data.get("value", ""))[:30]
        pending = data.get("pending_count", 0)
        return f"Queued: '{value}' ({pending} changes pending)"

    # Edits committed
    if "applied_count" in data:
        count = data.get("applied_count", 0)
        total = data.get("total_fields_filled", count)
        if total > count:
            return f"Applied {count} changes ({total} total fields filled)"
        return f"Applied {count} field changes"

    # Pending edits review
    if "pending_edits" in data:
        edits = data.get("pending_edits", [])
        if edits:
            return f"Ready to apply {len(edits)} changes"

    return None


# ============================================================================
# Main Agent Functions
# ============================================================================

async def run_agent_stream(
    pdf_path: str,
    instructions: str,
    output_path: str | None = None,
    is_continuation: bool = False,
    previous_edits: dict[str, Any] | None = None,
    resume_session_id: str | None = None,
    user_session_id: str | None = None,
    original_pdf_bytes: bytes | None = None,
):
    """
    Run the agent and yield messages as they come in (for streaming).

    Uses ClaudeSDKClient for custom tool support with session resumption
    for multi-turn conversations.

    Args:
        pdf_path: Path to the PDF file (should be the filled PDF if is_continuation=True)
        instructions: User's instructions for this turn
        output_path: Where to save the filled PDF
        is_continuation: Whether this is a continuation of a previous session
        previous_edits: Dict of field_id -> value from previous turns (for context)
        resume_session_id: Session ID from previous turn to resume conversation context
        user_session_id: Unique ID for this user's form-filling session (for concurrent users)
        original_pdf_bytes: The original (unfilled) PDF bytes for first-turn sessions

    Yields:
        dict: Serialized message from the agent, including session_id in complete event
    """
    print(f"[Agent Stream] Starting with pdf_path={pdf_path}, is_continuation={is_continuation}, resume_session_id={resume_session_id}, user_session_id={user_session_id}")

    if not AGENT_SDK_AVAILABLE:
        print(f"[Agent Stream] SDK not available: {AGENT_SDK_ERROR}")
        yield {"type": "error", "error": f"Claude Agent SDK not available: {AGENT_SDK_ERROR}"}
        return

    pdf_path = str(Path(pdf_path).resolve())
    if output_path:
        output_path = str(Path(output_path).resolve())

    # Get or create a session for this user
    session = _session_manager.get_or_create_session(user_session_id)
    # Set it as the current session in context for tools to access
    set_current_session(session)

    # Reset session appropriately
    if is_continuation:
        session.soft_reset()
        # Restore previous edits for context
        if previous_edits:
            session.applied_edits = dict(previous_edits)
    else:
        session.reset()
        # Store the original PDF bytes for new sessions
        if original_pdf_bytes:
            session.original_pdf_bytes = original_pdf_bytes

    # Build prompt based on whether this is a continuation
    if is_continuation:
        # Show what's already been filled
        edits_summary = ""
        if previous_edits:
            edits_list = [f"  - {k}: {v}" for k, v in list(previous_edits.items())[:10]]
            if len(previous_edits) > 10:
                edits_list.append(f"  ... and {len(previous_edits) - 10} more fields")
            edits_summary = "\n".join(edits_list)

        prompt = f"""This is a CONTINUATION of a form-filling session.

PDF Path (already filled): {pdf_path}
Output Path: {output_path or pdf_path}

Previous fields that were filled:
{edits_summary if edits_summary else "(see current values in list_all_fields)"}

User's NEW request: {instructions}

IMPORTANT: The PDF already contains values from the previous turn.
Load it, check what's already filled, then ONLY change the specific fields the user is asking about.
Do NOT re-fill fields unless the user specifically asks to change them."""

    else:
        prompt = f"""Please fill out this PDF form:

PDF Path: {pdf_path}
Output Path: {output_path or pdf_path.replace('.pdf', '_filled.pdf')}

Instructions: {instructions}

Start by loading the PDF, then list the fields, fill them according to the instructions, and commit the edits."""

    print(f"[Agent Stream] Creating ClaudeSDKClient...")
    yield {"type": "status", "message": "Connecting to Claude Agent SDK..."}

    options = _create_agent_options(session, output_path, is_continuation, resume_session_id)
    message_count = 0
    result_text = ""
    agent_session_id = None  # Will be extracted from ResultMessage

    try:
        async with ClaudeSDKClient(options=options) as client:
            print(f"[Agent Stream] Connected, sending query...")
            yield {"type": "status", "message": "Agent connected, processing..."}

            await client.query(prompt)

            async for message in client.receive_response():
                message_count += 1
                msg_type = type(message).__name__

                # Log detailed message content
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            result_text = block.text
                            # Show first 200 chars of text
                            preview = result_text[:200].replace('\n', ' ')
                            print(f"[Agent Stream] #{message_count} {msg_type}: {preview}...")
                        else:
                            # Could be ToolUseBlock or other types
                            block_type = type(block).__name__
                            print(f"[Agent Stream] #{message_count} {msg_type}/{block_type}: {str(block)[:150]}")
                elif ResultMessage and isinstance(message, ResultMessage):
                    # Extract session_id from ResultMessage for multi-turn support
                    agent_session_id = getattr(message, 'session_id', None)
                    print(f"[Agent Stream] #{message_count} {msg_type}: session_id={agent_session_id}")
                else:
                    # For other message types, show what we can
                    content_preview = ""
                    if hasattr(message, 'content'):
                        content_preview = str(message.content)[:150]
                    elif hasattr(message, 'text'):
                        content_preview = str(message.text)[:150]
                    print(f"[Agent Stream] #{message_count} {msg_type}: {content_preview}")

                yield _serialize_message(message)

    except Exception as e:
        print(f"[Agent Stream] Error: {e}")
        import traceback
        traceback.print_exc()
        yield {"type": "error", "error": f"Agent error: {str(e)}"}

    # Save session state to database for persistence across server restarts
    _session_manager.save_session(session)

    # Yield final summary with applied edits and session_id for multi-turn tracking
    yield {
        "type": "complete",
        "success": True,
        "result": result_text,
        "message_count": message_count,
        "applied_count": len(session.applied_edits),
        "applied_edits": dict(session.applied_edits),
        "session_id": agent_session_id,  # Return session_id for frontend to use in next turn
        "user_session_id": session.session_id,  # Return the user session ID for concurrent user tracking
    }


async def run_agent(
    pdf_path: str,
    instructions: str,
    output_path: str | None = None,
    is_continuation: bool = False,
    previous_edits: dict[str, Any] | None = None,
    user_session_id: str | None = None,
) -> dict:
    """
    Run the form-filling agent using ClaudeSDKClient.

    Args:
        pdf_path: Path to the PDF file to fill
        instructions: Natural language instructions for filling the form
        output_path: Optional path for the filled PDF
        is_continuation: Whether this is a continuation of a previous session
        previous_edits: Dict of field_id -> value from previous turns
        user_session_id: Unique ID for this user's form-filling session (for concurrent users)

    Returns:
        Summary of the agent execution
    """
    if not AGENT_SDK_AVAILABLE:
        raise ValueError(f"Claude Agent SDK not available: {AGENT_SDK_ERROR}")

    pdf_path = str(Path(pdf_path).resolve())
    if output_path:
        output_path = str(Path(output_path).resolve())

    # Get or create a session for this user
    session = _session_manager.get_or_create_session(user_session_id)
    # Set it as the current session in context for tools to access
    set_current_session(session)

    # Reset session appropriately
    if is_continuation:
        session.soft_reset()
        if previous_edits:
            session.applied_edits = dict(previous_edits)
    else:
        session.reset()

    if is_continuation:
        prompt = f"""This is a CONTINUATION of a form-filling session.

PDF Path (already filled): {pdf_path}
Output Path: {output_path or pdf_path}

User's NEW request: {instructions}

Load the PDF, check current values, then ONLY change the fields the user asks about."""
    else:
        prompt = f"""Please fill out this PDF form:

PDF Path: {pdf_path}
Output Path: {output_path or pdf_path.replace('.pdf', '_filled.pdf')}

Instructions: {instructions}

Start by loading the PDF, then list the fields, fill them according to the instructions, and commit the edits."""

    options = _create_agent_options(session, output_path, is_continuation)
    messages = []
    result_text = ""

    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)

        async for message in client.receive_response():
            messages.append(message)

            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        result_text = block.text
                        print(f"  Agent: {result_text[:100]}...")

    # Save session state to database for persistence across server restarts
    _session_manager.save_session(session)

    return {
        "success": True,
        "result": result_text,
        "message_count": len(messages),
        "applied_count": len(session.applied_edits),
        "applied_edits": dict(session.applied_edits),
        "user_session_id": session.session_id,
    }


# ============================================================================
# Testing
# ============================================================================

if __name__ == "__main__":
    print("Claude Agent SDK - Form Filling Agent")
    print("=" * 50)

    if not AGENT_SDK_AVAILABLE:
        print(f"ERROR: {AGENT_SDK_ERROR}")
        sys.exit(1)

    if len(sys.argv) < 3:
        print("Usage: python agent.py <pdf_path> <instructions>")
        print('\nExample: python agent.py form.pdf "name: John Doe, email: john@example.com"')
        sys.exit(1)

    pdf_path = sys.argv[1]
    instructions = sys.argv[2]

    print(f"PDF: {pdf_path}")
    print(f"Instructions: {instructions}")
    print("=" * 50)

    result = asyncio.run(run_agent(pdf_path, instructions))

    print("\n" + "=" * 50)
    print("Result:")
    print(result.get("result", "No result"))
    print(f"Fields applied: {result.get('applied_count', 0)}")
