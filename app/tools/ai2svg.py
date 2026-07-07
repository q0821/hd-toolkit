"""AI（Adobe Illustrator）/ PDF 轉 SVG 工具 — 後端 router

把上傳的 .ai / .pdf 逐頁（artboard）用 poppler 的 pdftocairo 轉成獨立向量
SVG，回傳 JSON（每頁一段 SVG）。需要系統套件 poppler（pdfinfo / pdftocairo，
已因 pdf2jpg 而存在）。
"""

import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(tags=["ai2svg"])

MAX_BYTES = 20 * 1024 * 1024  # 20MB
MAX_PAGES = 200
TIMEOUT = 30  # 秒


def _page_count(pdf_path: str) -> int:
    """用 pdfinfo 取頁數。"""
    try:
        proc = subprocess.run(
            ["pdfinfo", pdf_path],
            capture_output=True, text=True, timeout=TIMEOUT, check=True,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="伺服器缺少 poppler（pdfinfo），無法處理")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="讀取頁數逾時")
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=400, detail="無法讀取頁數，檔案可能已損壞或非 PDF 相容格式")
    for line in proc.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":", 1)[1].strip())
    raise HTTPException(status_code=400, detail="無法判讀頁數")


def _page_to_svg(pdf_path: str, page: int, out_path: str) -> str:
    """用 pdftocairo -svg 把單頁轉成 SVG，回傳 SVG 文字。"""
    try:
        subprocess.run(
            ["pdftocairo", "-svg", "-f", str(page), "-l", str(page), pdf_path, out_path],
            capture_output=True, timeout=TIMEOUT, check=True,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="伺服器缺少 poppler（pdftocairo），無法處理")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail=f"第 {page} 頁轉換逾時")
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=500, detail=f"第 {page} 頁轉換失敗")
    return Path(out_path).read_text(encoding="utf-8")


@router.post("/api/ai2svg/convert")
async def convert(file: UploadFile = File(..., description=".ai 或 .pdf 檔案")):
    """把 .ai / .pdf 逐頁轉成 SVG，回傳 JSON。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供檔案名稱")
    ext = Path(file.filename).suffix.lower()
    if ext not in (".ai", ".pdf"):
        raise HTTPException(status_code=400, detail="只接受 .ai 或 .pdf 檔案")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="檔案為空")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="檔案超過 20MB 上限")
    if not data.startswith(b"%PDF"):
        raise HTTPException(
            status_code=400,
            detail="此檔非 PDF 相容格式（舊版 .ai 需先在 Illustrator 另存為 PDF 相容）",
        )

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "src.pdf"
        src.write_bytes(data)
        count = _page_count(str(src))
        if count > MAX_PAGES:
            raise HTTPException(status_code=400, detail=f"頁數超過上限（{MAX_PAGES} 頁）")
        pages = []
        for p in range(1, count + 1):
            out = Path(tmp) / f"p{p}.svg"
            pages.append({"index": p, "svg": _page_to_svg(str(src), p, str(out))})

    return {"filename": Path(file.filename).stem, "page_count": count, "pages": pages}
