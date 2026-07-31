"""HEIC 支援的守門測試。

實際的解碼行為在瀏覽器裡（libheif WASM），pytest 測不到；這裡守的是
「前端資產有沒有正確接上」——共用模組取得得到、兩個工具頁真的有引用它、
以及 accept 白名單沒有漏掉 HEIC。這類斷鏈是改版時最容易靜默發生的 regression。
"""

import re

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

TOOLS_WITH_HEIC = ["/image-compressor", "/image-slicer"]


def test_shared_module_is_served():
    res = client.get("/static/shared/heic-decode.js")
    assert res.status_code == 200
    body = res.text
    assert "window.HeicDecode" in body
    assert "libheif-js@1.19.8" in body, "CDN 版本必須 pin 住，不可浮動"


def test_tool_pages_reference_the_shared_module():
    for path in TOOLS_WITH_HEIC:
        res = client.get(path)
        assert res.status_code == 200, path
        assert "/static/shared/heic-decode.js" in res.text, f"{path} 沒有引用 HEIC 解碼模組"


def _accept_attrs(html: str) -> list[str]:
    return re.findall(r'<input[^>]*type="file"[^>]*accept="([^"]*)"', html)


def test_tool_pages_accept_heic_uploads():
    """檔案選擇器要選得到 HEIC。compressor 用明確白名單，slicer 維持 image/*
    （原本就吃 SVG / BMP，不能因為這個 feature 收窄），兩者都必須帶 .heic 副檔名
    ——部分平台對 HEIC 回空 MIME，只靠 MIME 會選不到檔。"""
    for path in TOOLS_WITH_HEIC:
        accepts = _accept_attrs(client.get(path).text)
        assert accepts, f"{path} 找不到 file input 的 accept"
        acc = accepts[0]
        assert "image/heic" in acc or "image/*" in acc, f"{path} 的 accept 吃不到 HEIC：{acc}"
        assert ".heic" in acc, f"{path} 的 accept 沒有 .heic 副檔名（空 MIME 時的救援）：{acc}"


def test_slicer_did_not_narrow_its_accept():
    """slicer 原本是 image/*，這次不該為了 HEIC 把它收窄成白名單而擋掉 SVG / BMP。"""
    acc = _accept_attrs(client.get("/image-slicer").text)[0]
    assert "image/*" in acc, f"image-slicer 的 accept 被收窄了：{acc}"


def test_avif_path_is_not_taken_over_by_heic():
    """AVIF 與 HEIC 共用 ISO BMFF 容器，判斷寫鬆會讓既有 AVIF 支援倒退。
    模組內必須保留排除 avif brand 的那道防線。"""
    body = client.get("/static/shared/heic-decode.js").text
    assert "AVIF_BRAND" in body
    assert "avif" in body and "avis" in body
    # image-compressor 原本就支援 AVIF，不可被移除
    assert "image/avif" in client.get("/image-compressor").text


def test_conversion_label_follows_output_format():
    """列上的「HEIC → X」標籤必須跟著輸出格式走。寫死成 JPG 的話，使用者切到
    WEBP 後標籤會標出一個錯的落點——那正好違背了加這個標籤的目的。"""
    body = client.get("/image-compressor").text
    assert "convLabel" in body, "標籤文字應由 targetCodecFor 推導"
    assert "refreshConvChips" in body, "切換輸出格式時要更新既有列的標籤"
    assert "'HEIC → JPG'" not in body, "標籤不可寫死"


def test_decoder_retry_bypasses_module_map():
    """瀏覽器的 module map 會快取失敗的 import，只清自己的 promise 快取不夠，
    同一個 URL 不會再發請求。重試必須換掉 module specifier。"""
    body = client.get("/static/shared/heic-decode.js").text
    assert "_attempt" in body
    assert "?_r=" in body, "重試時要加 query 參數換掉 specifier"


def test_untouched_tools_keep_their_accept_lists():
    """這次範圍只有兩個工具，其餘三個不該被順手改動。"""
    for path in ["/bg-remover", "/sticker-ai", "/invoice-stamp"]:
        body = client.get(path).text
        assert "image/heic" not in body, f"{path} 不在本次範圍內，不該出現 HEIC"
