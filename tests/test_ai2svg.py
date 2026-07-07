from fastapi.testclient import TestClient

from conftest import make_pdf
from main import app

client = TestClient(app)


def _post(pdf_bytes: bytes, filename: str = "sample.pdf"):
    return client.post(
        "/api/ai2svg/convert",
        files={"file": (filename, pdf_bytes, "application/pdf")},
    )


def test_convert_returns_one_svg_per_page():
    res = _post(make_pdf(3), "深河 logo.ai")
    assert res.status_code == 200
    data = res.json()
    assert data["page_count"] == 3
    assert data["filename"] == "深河 logo"
    assert len(data["pages"]) == 3
    assert [p["index"] for p in data["pages"]] == [1, 2, 3]


def test_each_page_is_pure_vector_svg():
    res = _post(make_pdf(2))
    pages = res.json()["pages"]
    for p in pages:
        assert "<svg" in p["svg"]
        assert "<image" not in p["svg"]      # 無內嵌點陣圖
        assert "font-family" not in p["svg"]  # 純向量、無字型依賴


def test_rejects_non_ai_pdf_extension():
    res = client.post(
        "/api/ai2svg/convert",
        files={"file": ("note.txt", b"%PDF-1.4 hello", "text/plain")},
    )
    assert res.status_code == 400
    assert "只接受" in res.json()["detail"]


def test_rejects_empty_file():
    res = _post(b"", "empty.pdf")
    assert res.status_code == 400
    assert "空" in res.json()["detail"]


def test_rejects_non_pdf_magic_bytes():
    # 副檔名是 .ai 但內容不是 PDF 相容（舊版 .ai）
    res = _post(b"\x00\x01 not a pdf", "old.ai")
    assert res.status_code == 400
    assert "PDF 相容" in res.json()["detail"]


def test_rejects_too_many_pages():
    res = _post(make_pdf(201), "big.pdf")
    assert res.status_code == 400
    assert "頁數超過上限" in res.json()["detail"]
