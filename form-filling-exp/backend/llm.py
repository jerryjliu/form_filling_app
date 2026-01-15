"""
LLM integration for mapping natural language instructions to form fields.

Uses the native Anthropic SDK with structured outputs (beta).
Reference: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

This module handles the "AI" part - understanding what the user wants
and mapping it to specific form fields.

Edit this file to:
- Change the model (claude-sonnet-4-5, claude-opus-4-5, etc.)
- Customize the prompts
- Add validation/retry logic
"""

import os
from typing import Union

import anthropic
from pydantic import BaseModel, Field

from pdf_processor import DetectedField


# ============================================================================
# Structured Output Models (Pydantic)
# ============================================================================

class FieldEdit(BaseModel):
    """A single field edit to apply to the PDF form."""
    field_id: str = Field(description="The exact field_id from the available fields")
    value: Union[str, bool] = Field(description="The value to fill in. String for text fields, boolean for checkboxes.")


class FormEdits(BaseModel):
    """Collection of field edits to apply to the form."""
    edits: list[FieldEdit] = Field(
        default_factory=list,
        description="List of field edits. Only include fields that should be filled based on the instructions."
    )


# ============================================================================
# Configuration
# ============================================================================

def get_client(api_key: str | None = None) -> anthropic.Anthropic:
    """
    Get the Anthropic client.

    Args:
        api_key: Optional API key. If not provided, falls back to ANTHROPIC_API_KEY env var.

    Returns:
        Configured Anthropic client instance.
    """
    # Use provided key or fall back to env var
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")

    if not key:
        raise ValueError(
            "Anthropic API key is required. "
            "Either pass api_key parameter or set ANTHROPIC_API_KEY environment variable."
        )

    return anthropic.Anthropic(api_key=key)


# Default model - structured outputs supported on Sonnet 4.5, Opus 4.5, Haiku 4.5
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")


# ============================================================================
# Core LLM Function
# ============================================================================

def map_instructions_to_fields(
    instructions: str,
    fields: list[DetectedField],
    model: str = DEFAULT_MODEL,
) -> list[dict]:
    """
    Use LLM to map natural language instructions to specific form field edits.
    
    Uses Anthropic's structured outputs beta with Pydantic models.
    
    Args:
        instructions: Natural language description of what to fill
            e.g., "My name is John Doe, I live at 123 Main St, and I agree to the terms"
        fields: List of detected form fields from the PDF
        model: Claude model to use (must support structured outputs)
        
    Returns:
        List of edits: [{"field_id": str, "value": str|bool}, ...]
    """
    if not fields:
        return []
    
    # Build field descriptions for the LLM
    field_descriptions = _build_field_descriptions(fields)
    
    prompt = f"""You are a form-filling assistant. Given a list of form fields from a PDF and user instructions, determine which fields should be filled with what values.

## Available Form Fields:
{field_descriptions}

## User Instructions:
{instructions}

## Your Task:
Analyze the user's instructions and determine which fields should be filled.

Rules:
- Only include fields that should be filled based on the instructions
- If a field doesn't match any instruction, don't include it
- For checkboxes: use true if the user indicates agreement/yes/checking, false otherwise
- For dropdowns: use one of the available options that best matches the user's intent
- Match field_id exactly as shown above

Return the edits."""

    client = get_client()
    
    # Use the structured outputs beta with .parse() for Pydantic support
    response = client.beta.messages.parse(
        model=model,
        max_tokens=1024,
        betas=["structured-outputs-2025-11-13"],
        messages=[
            {"role": "user", "content": prompt}
        ],
        output_format=FormEdits,
    )
    
    # Extract the parsed Pydantic model
    result: FormEdits = response.parsed_output
    
    # Validate field_ids exist
    valid_field_ids = {f.field_id for f in fields}
    edits = [
        {"field_id": edit.field_id, "value": edit.value}
        for edit in result.edits
        if edit.field_id in valid_field_ids
    ]
    
    return edits


def _build_field_descriptions(fields: list[DetectedField]) -> str:
    """Build a human-readable description of fields for the LLM."""
    lines = []
    
    for f in fields:
        field_type_str = f.field_type.value if hasattr(f.field_type, 'value') else str(f.field_type)
        desc = f"- **{f.field_id}** (type: {field_type_str})"
        
        if f.label_context:
            # Truncate long context
            context = f.label_context[:150]
            if len(f.label_context) > 150:
                context += "..."
            desc += f"\n  Context/Label: \"{context}\""
        
        if f.options:
            desc += f"\n  Options: {f.options}"
            
        if f.current_value:
            desc += f"\n  Current value: \"{f.current_value}\""
            
        lines.append(desc)
    
    return "\n".join(lines)


# ============================================================================
# Alternative: Simple Rule-Based Mapping (No LLM)
# ============================================================================

def simple_keyword_mapping(
    instructions: str,
    fields: list[DetectedField],
) -> list[dict]:
    """
    A simple keyword-based mapping without LLM.
    
    This is useful for testing or when you don't want to use an LLM.
    Override or extend this for custom logic.
    
    Example:
        instructions = "name: John Doe, email: john@example.com"
        -> Looks for fields with "name" in context, fills with "John Doe"
    """
    edits = []
    
    # Parse simple key: value pairs
    # Supports "key: value" and "key = value" formats
    import re
    pairs = re.findall(r'(\w+(?:\s+\w+)?)\s*[:=]\s*([^,;\n]+)', instructions)
    
    for key, value in pairs:
        key = key.strip().lower()
        value = value.strip()
        
        # Find fields that match this key
        for field in fields:
            context_lower = field.label_context.lower()
            field_name_lower = (field.native_field_name or "").lower()
            
            if key in context_lower or key in field_name_lower:
                edits.append({
                    "field_id": field.field_id,
                    "value": value
                })
                break  # Only fill first matching field
    
    return edits


# ============================================================================
# Testing
# ============================================================================

if __name__ == "__main__":
    import json
    from pdf_processor import FieldType
    
    print("Testing LLM integration with Anthropic structured outputs...")
    print(f"Model: {DEFAULT_MODEL}")
    print("Beta: structured-outputs-2025-11-13")
    
    # Create some dummy fields for testing
    test_fields = [
        DetectedField(
            field_id="page0_full_name",
            field_type=FieldType.TEXT,
            bbox=(100, 100, 300, 120),
            page=0,
            label_context="Full Name: | Enter your legal name",
            native_field_name="full_name"
        ),
        DetectedField(
            field_id="page0_email",
            field_type=FieldType.TEXT, 
            bbox=(100, 140, 300, 160),
            page=0,
            label_context="Email Address:",
            native_field_name="email"
        ),
        DetectedField(
            field_id="page0_agree",
            field_type=FieldType.CHECKBOX,
            bbox=(100, 200, 120, 220),
            page=0,
            label_context="I agree to the terms and conditions",
            native_field_name="agree_terms"
        ),
    ]
    
    # Test instructions
    test_instructions = "My name is Jerry Liu, my email is jerry@llamaindex.ai, and I agree to the terms."
    
    print(f"\nTest instructions: {test_instructions}")
    print("\n" + "="*50)
    print("Simple keyword mapping result:")
    print("="*50)
    simple_result = simple_keyword_mapping(test_instructions, test_fields)
    print(json.dumps(simple_result, indent=2))
    
    print("\n" + "="*50)
    print("LLM mapping result (requires ANTHROPIC_API_KEY):")
    print("="*50)
    try:
        llm_result = map_instructions_to_fields(test_instructions, test_fields)
        print(json.dumps(llm_result, indent=2))
    except ValueError as e:
        print(f"Skipped: {e}")
    except Exception as e:
        print(f"Error: {e}")
