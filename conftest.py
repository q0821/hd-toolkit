"""pytest 共用設定：確保測試能 import 專案根模組（main / app），並提供
測試用的多頁向量 PDF 產生器（無外部依賴、確定性、非客戶資產）。"""

import sys
from pathlib import Path

ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def make_pdf(n_pages: int) -> bytes:
    """手寫最小多頁 PDF，每頁一個填色矩形（向量繪圖），顏色隨頁不同。"""
    objs = []
    kids = [3 + i * 2 for i in range(n_pages)]
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    kids_ref = " ".join(f"{k} 0 R" for k in kids).encode()
    objs.append(
        b"<< /Type /Pages /Kids [" + kids_ref + b"] /Count "
        + str(n_pages).encode() + b" >>"
    )
    for i in range(n_pages):
        content_obj = 3 + i * 2 + 1
        r = (i * 0.3) % 1.0
        stream = f"{r:.2f} 0.20 0.60 rg 100 100 300 300 re f".encode()
        objs.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 500] "
            b"/Contents " + str(content_obj).encode() + b" 0 R /Resources << >> >>"
        )
        objs.append(
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n"
            + stream + b"\nendstream"
        )
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for idx, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{idx} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\n"
    out += b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF"
    return bytes(out)
