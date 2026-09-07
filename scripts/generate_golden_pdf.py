#!/usr/bin/env python3
"""
Generates standard 10-page US Letter PDF fixture for PERMISSA:
tests/fixtures/golden/the-final-witness.pdf
from tests/fixtures/golden/the-final-witness.fountain
"""
import os
import re

def escape_pdf_str(text: str) -> str:
    # Replace non-ascii with ascii approximations or safe tokens
    clean = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    # Handle em-dash
    clean = clean.replace('—', ' - ').replace('–', ' - ')
    # Safe ASCII conversion for standard Type 1 font
    return clean.encode('ascii', errors='replace').decode('ascii')

def build_pdf(pages_text: list[list[str]], output_path: str):
    objects = []
    
    def add_obj(content: str | bytes) -> int:
        idx = len(objects) + 1
        objects.append(content)
        return idx

    # Obj 1: Catalog (will set later)
    # Obj 2: Pages (will set later)
    # Obj 3: Font
    font_content = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"
    font_idx = 3

    page_obj_indices = []
    content_obj_indices = []

    # Reserve indices:
    # 1: Catalog
    # 2: Pages
    # 3: Font
    # 4 .. 4 + N - 1: Page objects
    # 4 + N .. 4 + 2N - 1: Content stream objects

    num_pages = len(pages_text)
    
    # We will populate objects list in order
    objects = [None] * (3 + num_pages * 2)
    objects[2] = font_content # obj 3

    for i, page_lines in enumerate(pages_text):
        page_idx = 4 + i
        content_idx = 4 + num_pages + i
        page_obj_indices.append(page_idx)
        content_obj_indices.append(content_idx)

        # Build stream text
        stream_parts = ["BT", "/F1 10 Tf", "12 TL", "72 720 Td"]
        for line in page_lines[:55]: # Max 55 lines per page
            escaped = escape_pdf_str(line)
            stream_parts.append(f"({escaped}) '")
        stream_parts.append("ET")
        stream_body = "\n".join(stream_parts).encode('latin-1')

        stream_obj = (
            f"<< /Length {len(stream_body)} >>\n"
            f"stream\n"
        ).encode('ascii') + stream_body + b"\nendstream"
        objects[content_idx - 1] = stream_obj

        page_obj = (
            f"<< /Type /Page\n"
            f"   /Parent 2 0 R\n"
            f"   /MediaBox [0 0 612 792]\n"
            f"   /Contents {content_idx} 0 R\n"
            f"   /Resources << /Font << /F1 3 0 R >> >>\n"
            f">>"
        )
        objects[page_idx - 1] = page_obj

    # Obj 1: Catalog
    objects[0] = "<< /Type /Catalog /Pages 2 0 R >>"

    # Obj 2: Pages tree
    kids_str = " ".join(f"{idx} 0 R" for idx in page_obj_indices)
    objects[1] = f"<< /Type /Pages /Kids [ {kids_str} ] /Count {num_pages} >>"

    # Write out PDF
    with open(output_path, "wb") as f:
        f.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for i, obj in enumerate(objects):
            offset = f.tell()
            offsets.append(offset)
            f.write(f"{i + 1} 0 obj\n".encode('ascii'))
            if isinstance(obj, str):
                f.write(obj.encode('ascii') + b"\n")
            else:
                f.write(obj + b"\n")
            f.write(b"endobj\n")

        xref_offset = f.tell()
        f.write(f"xref\n0 {len(objects) + 1}\n".encode('ascii'))
        f.write(b"0000000000 65535 f \n")
        for off in offsets[1:]:
            f.write(f"{off:010d} 00000 n \n".encode('ascii'))

        trailer = (
            f"trailer\n"
            f"<< /Size {len(objects) + 1}\n"
            f"   /Root 1 0 R\n"
            f">>\n"
            f"startxref\n"
            f"{xref_offset}\n"
            f"%%EOF\n"
        )
        f.write(trailer.encode('ascii'))

def main():
    fountain_path = "tests/fixtures/golden/the-final-witness.fountain"
    pdf_path = "tests/fixtures/golden/the-final-witness.pdf"

    with open(fountain_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Split into pages by ===
    raw_pages = content.split("===")
    pages = []
    for p in raw_pages:
        lines = [l.strip() for l in p.strip().split("\n") if l.strip()]
        if lines:
            pages.append(lines)

    print(f"Loaded {len(pages)} pages from {fountain_path}")
    build_pdf(pages, pdf_path)
    print(f"Successfully generated {pdf_path} ({os.path.getsize(pdf_path)} bytes, {len(pages)} pages)")

if __name__ == "__main__":
    main()
