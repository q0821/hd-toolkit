"""hd-toolkit — 前端小工具聚合站

首頁是工具選單，每個工具一個頁面。FastAPI 負責提供靜態頁與少數需要後端的 API
（目前只有 pdf2jpg；圖片切片等工具是純前端）。
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.tools import pdf2jpg

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="hd-toolkit",
    description="前端小工具聚合站",
    version="2.0.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(pdf2jpg.router)


def _page(*parts: str) -> FileResponse:
    return FileResponse(STATIC_DIR.joinpath(*parts))


@app.get("/", include_in_schema=False)
async def home():
    """首頁 — 工具選單。"""
    return _page("index.html")


@app.get("/pdf2jpg", include_in_schema=False)
async def page_pdf2jpg():
    return _page("pdf2jpg", "index.html")


# 圖片切片工具頁面（純前端）— 階段 3 會放上實際內容
@app.get("/image-slicer", include_in_schema=False)
async def page_image_slicer():
    return _page("image-slicer", "index.html")


@app.get("/api/health")
async def health_check():
    """健康檢查端點。"""
    return {"status": "ok"}
