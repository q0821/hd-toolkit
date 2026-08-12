"""圖片壓字工具的靜態整合測試。

Canvas 的像素合成與拖曳互動在瀏覽器端驗證；pytest 守住的是
路由、首頁入口、圖片解碼模組與下載功能的必要介面沒有斷掉。
"""

import re

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_text_watermark_page_is_served():
    response = client.get("/text-watermark")

    assert response.status_code == 200
    assert 'id="fileInput"' in response.text
    assert 'multiple' in response.text
    assert 'id="textInput"' in response.text
    assert 'id="previewCanvas"' in response.text


def test_homepage_links_to_text_watermark():
    response = client.get("/")

    assert response.status_code == 200
    assert 'href="/text-watermark"' in response.text
    assert "圖片壓字" in response.text


def test_text_watermark_accepts_supported_image_inputs():
    response = client.get("/text-watermark")
    accepts = re.findall(
        r'<input[^>]*type="file"[^>]*accept="([^"]*)"', response.text
    )

    assert accepts
    assert "image/jpeg" in accepts[0]
    assert "image/png" in accepts[0]
    assert "image/webp" in accepts[0]
    assert ".heic" in accepts[0]
    assert ".heif" in accepts[0]


def test_text_watermark_uses_browser_only_processing():
    response = client.get("/text-watermark")

    assert "/static/shared/heic-decode.js" in response.text
    assert "JSZip" in response.text
    assert "canvasToBlob" in response.text
    assert "window.TextWatermark" in response.text
    assert "圖片不會上傳" in response.text
