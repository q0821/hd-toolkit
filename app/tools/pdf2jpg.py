"""PDF to JPG 工具 — 後端 router

把上傳的 PDF 每一頁轉成 JPG，打包成 ZIP 回傳。
需要系統套件 poppler（pdf2image 的渲染後端）。
"""

import io
import zipfile
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pdf2image import convert_from_bytes
from pdf2image.exceptions import PDFPageCountError, PDFSyntaxError

router = APIRouter(tags=["pdf2jpg"])


async def _pdf_to_zip(file: UploadFile, dpi: int, quality: int) -> StreamingResponse:
    """共用轉換邏輯：UploadFile → 內含多張 JPG 的 ZIP StreamingResponse。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供檔案名稱")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="只接受 PDF 檔案")

    try:
        pdf_bytes = await file.read()
    except Exception as e:  # noqa: BLE001 - 讀檔失敗一律回 400
        raise HTTPException(status_code=400, detail=f"讀取檔案失敗: {e}")

    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="檔案為空")

    try:
        images = convert_from_bytes(pdf_bytes, dpi=dpi)
    except PDFPageCountError:
        raise HTTPException(status_code=400, detail="無法讀取 PDF 頁數，檔案可能已損壞")
    except PDFSyntaxError:
        raise HTTPException(status_code=400, detail="PDF 格式錯誤")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"PDF 轉換失敗: {e}")

    if not images:
        raise HTTPException(status_code=400, detail="PDF 沒有任何頁面")

    base_name = Path(file.filename).stem
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, image in enumerate(images, start=1):
            img_buffer = io.BytesIO()
            image.save(img_buffer, format="JPEG", quality=quality)
            zf.writestr(f"{base_name}_{i:03d}.jpg", img_buffer.getvalue())
    zip_buffer.seek(0)

    zip_filename = f"{base_name}_images.zip"
    encoded = quote(zip_filename)  # RFC 5987：支援中文檔名
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.post("/api/pdf2jpg/convert")
async def convert_pdf(
    file: UploadFile = File(..., description="PDF 檔案"),
    dpi: int = Form(default=150, ge=72, le=600, description="解析度 (72-600)"),
    quality: int = Form(default=85, ge=1, le=100, description="JPG 品質 (1-100)"),
) -> StreamingResponse:
    """將 PDF 轉換為 JPG 圖片並打包成 ZIP。"""
    return await _pdf_to_zip(file, dpi, quality)


@router.post("/api/convert", include_in_schema=False)
async def convert_pdf_legacy(
    file: UploadFile = File(...),
    dpi: int = Form(default=150, ge=72, le=600),
    quality: int = Form(default=85, ge=1, le=100),
) -> StreamingResponse:
    """舊路徑相容別名（pdf2jpg 單一工具時代的 /api/convert）。

    新程式請改用 /api/pdf2jpg/convert；此別名預計在工具箱穩定後移除。
    """
    return await _pdf_to_zip(file, dpi, quality)
