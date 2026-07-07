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
