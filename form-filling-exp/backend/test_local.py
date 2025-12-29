"""
Local testing script for PDF form filling.

Run this to test the core logic without starting the server.

Usage:
    python test_local.py path/to/form.pdf "Your instructions here"

Examples:
    # Just analyze the PDF
    python test_local.py sample.pdf
    
    # Fill the PDF with instructions (requires OPENAI_API_KEY)
    python test_local.py sample.pdf "name: John Doe, email: john@example.com"
    
    # Fill without LLM
    python test_local.py sample.pdf "name: John Doe" --no-llm
"""

import sys
import json
from pathlib import Path

from pdf_processor import detect_form_fields, edit_pdf_with_instructions, get_form_summary


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    
    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"Error: File not found: {pdf_path}")
        return
    
    # Read PDF
    pdf_bytes = pdf_path.read_bytes()
    
    # Detect fields
    print("=" * 60)
    print("DETECTED FORM FIELDS")
    print("=" * 60)
    print(get_form_summary(pdf_bytes))
    
    # If instructions provided, fill the PDF
    if len(sys.argv) >= 3:
        instructions = sys.argv[2]
        use_llm = "--no-llm" not in sys.argv
        
        print("=" * 60)
        print("FILLING PDF")
        print("=" * 60)
        print(f"Instructions: {instructions}")
        print(f"Using LLM: {use_llm}")
        print()
        
        fields = detect_form_fields(pdf_bytes)
        
        if not fields:
            print("No fields to fill!")
            return
        
        # Map instructions to fields
        if use_llm:
            from llm import map_instructions_to_fields
            try:
                edits = map_instructions_to_fields(instructions, fields)
            except ValueError as e:
                print(f"LLM Error: {e}")
                print("Try with --no-llm flag to use simple keyword matching.")
                return
        else:
            from llm import simple_keyword_mapping
            edits = simple_keyword_mapping(instructions, fields)
        
        print("Edits to apply:")
        print(json.dumps(edits, indent=2))
        print()
        
        if not edits:
            print("No edits could be determined from your instructions.")
            return
        
        # Apply edits
        filled_pdf = edit_pdf_with_instructions(pdf_bytes, edits)
        
        # Save
        output_path = pdf_path.stem + "_filled.pdf"
        Path(output_path).write_bytes(filled_pdf)
        print(f"✓ Saved filled PDF to: {output_path}")


if __name__ == "__main__":
    main()

