"""
Core PDF form processing logic.

This module handles:
1. Detecting fillable AcroForm fields in PDFs
2. Applying edits to form fields

Edit this file to customize PDF processing behavior.
"""

from dataclasses import dataclass, asdict
from enum import Enum
import fitz  # PyMuPDF


class FieldType(Enum):
    TEXT = "text"
    CHECKBOX = "checkbox"
    DROPDOWN = "dropdown"
    RADIO = "radio"


@dataclass
class DetectedField:
    """Represents a detected form field in the PDF."""
    field_id: str
    field_type: FieldType
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1)
    page: int
    label_context: str  # nearby text for semantic understanding
    current_value: str | None = None  # current value if any
    options: list[str] | None = None  # for dropdowns/radios
    native_field_name: str | None = None  # the AcroForm field name
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        d = asdict(self)
        d['field_type'] = self.field_type.value
        return d


@dataclass 
class FieldEdit:
    """Represents an edit to apply to a form field."""
    field_id: str
    value: str | bool


def detect_form_fields(pdf_bytes: bytes) -> list[DetectedField]:
    """
    Detect all fillable AcroForm fields in the PDF.
    
    This ONLY detects native PDF form widgets (AcroForm fields).
    Non-form PDFs will return an empty list.
    
    Args:
        pdf_bytes: The PDF file as bytes
        
    Returns:
        List of detected form fields with their metadata
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    fields = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        widgets = list(page.widgets())
        
        for widget in widgets:
            # Skip null/invalid widgets
            if not widget.field_name:
                continue
                
            field_type = _widget_type_to_field_type(widget.field_type)
            
            # Get dropdown/radio options if applicable
            options = None
            if widget.field_type in (fitz.PDF_WIDGET_TYPE_COMBOBOX, fitz.PDF_WIDGET_TYPE_LISTBOX):
                options = widget.choice_values or []
            
            # Get current value
            current_value = widget.field_value
            if isinstance(current_value, bool):
                current_value = str(current_value).lower()
            
            fields.append(DetectedField(
                field_id=f"page{page_num}_{widget.field_name}",
                field_type=field_type,
                bbox=tuple(widget.rect),
                page=page_num,
                label_context=_extract_nearby_text(page, widget.rect),
                current_value=current_value,
                options=options,
                native_field_name=widget.field_name
            ))
    
    doc.close()
    return fields


def apply_edits(pdf_bytes: bytes, edits: list[FieldEdit]) -> bytes:
    """
    Apply a list of edits to form fields in the PDF.
    
    Args:
        pdf_bytes: The original PDF as bytes
        edits: List of field edits to apply
        
    Returns:
        Modified PDF as bytes
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    
    # Build a lookup of field_id -> edit
    edit_map = {e.field_id: e for e in edits}
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        for widget in page.widgets():
            if not widget.field_name:
                continue
                
            field_id = f"page{page_num}_{widget.field_name}"
            
            if field_id in edit_map:
                edit = edit_map[field_id]
                _apply_widget_edit(widget, edit.value)
    
    result = doc.tobytes()
    doc.close()
    return result


def edit_pdf_with_instructions(
    pdf_bytes: bytes,
    edits: list[dict],  # List of {"field_id": str, "value": str|bool}
) -> bytes:
    """
    Edit a PDF using a pre-computed list of field edits.
    
    This is the main entry point after LLM has mapped instructions to fields.
    
    Args:
        pdf_bytes: The PDF file as bytes
        edits: List of edits with field_id and value
        
    Returns:
        Modified PDF as bytes
    """
    field_edits = [
        FieldEdit(
            field_id=e["field_id"],
            value=e["value"]
        )
        for e in edits
    ]
    return apply_edits(pdf_bytes, field_edits)


# ============================================================================
# Helper Functions
# ============================================================================

def _extract_nearby_text(page: fitz.Page, rect: fitz.Rect, radius: int = 100) -> str:
    """
    Extract text near a bounding box to understand field context.
    
    This helps the LLM understand what each field is for by providing
    surrounding labels and text.
    """
    # Expand the search area
    search_rect = fitz.Rect(rect)
    search_rect.x0 -= radius
    search_rect.y0 -= radius  
    search_rect.x1 += radius
    search_rect.y1 += radius
    
    # Clip to page bounds
    page_rect = page.rect
    search_rect.intersect(page_rect)
    
    text = page.get_text("text", clip=search_rect).strip()
    
    # Clean up whitespace
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    return ' | '.join(lines[:5])  # Limit to first 5 nearby text chunks


def _widget_type_to_field_type(widget_type: int) -> FieldType:
    """Map PyMuPDF widget types to our FieldType enum."""
    mapping = {
        fitz.PDF_WIDGET_TYPE_TEXT: FieldType.TEXT,
        fitz.PDF_WIDGET_TYPE_CHECKBOX: FieldType.CHECKBOX,
        fitz.PDF_WIDGET_TYPE_COMBOBOX: FieldType.DROPDOWN,
        fitz.PDF_WIDGET_TYPE_LISTBOX: FieldType.DROPDOWN,
        fitz.PDF_WIDGET_TYPE_RADIOBUTTON: FieldType.RADIO,
    }
    return mapping.get(widget_type, FieldType.TEXT)


def _apply_widget_edit(widget: fitz.Widget, value: str | bool):
    """Apply an edit to a specific widget."""
    widget_type = widget.field_type
    
    if widget_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
        # For checkboxes, convert string "true"/"false" to bool
        if isinstance(value, str):
            value = value.lower() in ('true', 'yes', '1', 'checked')
        widget.field_value = value
        
    elif widget_type == fitz.PDF_WIDGET_TYPE_RADIOBUTTON:
        # Radio buttons need special handling
        widget.field_value = str(value)
        
    else:
        # Text fields, dropdowns, etc.
        widget.field_value = str(value)
    
    widget.update()


# ============================================================================
# Utility for Testing
# ============================================================================

def get_form_summary(pdf_bytes: bytes) -> str:
    """
    Get a human-readable summary of form fields in a PDF.
    Useful for testing and debugging.
    """
    fields = detect_form_fields(pdf_bytes)
    
    if not fields:
        return "No fillable form fields detected in this PDF."
    
    lines = [f"Found {len(fields)} fillable form fields:\n"]
    
    for f in fields:
        lines.append(f"  - {f.field_id} ({f.field_type.value})")
        lines.append(f"    Context: {f.label_context[:80]}...")
        if f.current_value:
            lines.append(f"    Current value: {f.current_value}")
        if f.options:
            lines.append(f"    Options: {f.options}")
        lines.append("")
    
    return '\n'.join(lines)


if __name__ == "__main__":
    # Quick test - you can run this file directly to test
    import sys
    
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
        with open(pdf_path, 'rb') as f:
            pdf_bytes = f.read()
        print(get_form_summary(pdf_bytes))
    else:
        print("Usage: python pdf_processor.py <path_to_pdf>")
        print("\nThis will show all detected form fields in the PDF.")

