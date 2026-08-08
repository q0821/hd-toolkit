import asyncio
import base64

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.tools import sticker_ai
from main import app


client = TestClient(app)
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
FORM = {
    "provider": "openai",
    "api_key": "sk-test-secret",
    "model": "gpt-image-2",
    "prompt": "test image",
    "size": "1024x1024",
    "quality": "medium",
    "transparent": "false",
}


def _files(count: int, data: bytes = PNG_1X1, content_type: str = "image/png"):
    return [
        ("reference", (f"reference-{index}.png", data, content_type))
        for index in range(count)
    ]


def test_generate_rejects_more_than_six_references(monkeypatch):
    async def fake_openai(*args, **kwargs):
        return PNG_1X1

    monkeypatch.setattr(sticker_ai, "_call_openai", fake_openai)
    response = client.post("/api/sticker-ai/generate", data=FORM, files=_files(7))

    assert response.status_code == 400
    assert "最多 6 張" in response.json()["detail"]


def test_generate_rejects_non_image_reference(monkeypatch):
    async def fake_openai(*args, **kwargs):
        return PNG_1X1

    monkeypatch.setattr(sticker_ai, "_call_openai", fake_openai)
    files = _files(1, b"not an image", "image/png")
    response = client.post("/api/sticker-ai/generate", data=FORM, files=files)

    assert response.status_code == 400
    assert "有效的 PNG、JPEG 或 WebP" in response.json()["detail"]


def test_generate_rejects_oversized_reference(monkeypatch):
    async def fake_openai(*args, **kwargs):
        return PNG_1X1

    monkeypatch.setattr(sticker_ai, "_call_openai", fake_openai)
    monkeypatch.setattr(sticker_ai, "MAX_IMAGE_BYTES", len(PNG_1X1) - 1)
    response = client.post("/api/sticker-ai/generate", data=FORM, files=_files(1))

    assert response.status_code == 400
    assert "10 MB" in response.json()["detail"]


def test_reference_reader_never_requests_more_than_limit_plus_one(monkeypatch):
    requested_sizes = []

    class OversizedUpload:
        filename = "large.png"

        async def read(self, size=-1):
            requested_sizes.append(size)
            return b"x" * size

    monkeypatch.setattr(sticker_ai, "MAX_IMAGE_BYTES", 4)
    monkeypatch.setattr(sticker_ai, "MAX_TOTAL_IMAGE_BYTES", 10)

    try:
        asyncio.run(sticker_ai._read_references([OversizedUpload()]))
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("Oversized upload should be rejected")

    assert requested_sizes == [5]


def test_openai_edit_sends_repeated_image_parts():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["body"] = request.content
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(PNG_1X1).decode()}]})

    references = [
        sticker_ai.ReferenceImage("front.png", "image/png", PNG_1X1),
        sticker_ai.ReferenceImage("left.png", "image/png", PNG_1X1),
    ]

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            return await sticker_ai._call_openai(
                http_client,
                "sk-test-secret",
                "gpt-image-2",
                "prompt",
                "1024x1024",
                "medium",
                False,
                references,
            )

    result = asyncio.run(run())

    assert result == PNG_1X1
    assert captured["path"] == "/v1/images/edits"
    assert captured["body"].count(b'name="image[]"') == 2


def test_google_generation_sends_all_inline_images():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["json"] = __import__("json").loads(request.content)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "inlineData": {
                                        "mimeType": "image/png",
                                        "data": base64.b64encode(PNG_1X1).decode(),
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    references = [
        sticker_ai.ReferenceImage("front.png", "image/png", PNG_1X1),
        sticker_ai.ReferenceImage("right.png", "image/png", PNG_1X1),
    ]

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            return await sticker_ai._call_google(
                http_client,
                "google-test-secret",
                "gemini-3-pro-image-preview",
                "prompt",
                references,
            )

    data, mime = asyncio.run(run())
    parts = captured["json"]["contents"][0]["parts"]

    assert data == PNG_1X1
    assert mime == "image/png"
    assert parts[0] == {"text": "prompt"}
    assert len([part for part in parts if "inline_data" in part]) == 2


def test_no_reference_uses_openai_generations_endpoint():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(PNG_1X1).decode()}]})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            return await sticker_ai._call_openai(
                http_client,
                "sk-test-secret",
                "gpt-image-2",
                "prompt",
                "1024x1024",
                "medium",
                False,
                [],
            )

    assert asyncio.run(run()) == PNG_1X1
    assert captured["path"] == "/v1/images/generations"


def test_upstream_error_never_contains_api_key():
    secret = "sk-test-secret"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": f"invalid credential {secret}"}})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            await sticker_ai._call_openai(
                http_client,
                secret,
                "gpt-image-2",
                "prompt",
                "1024x1024",
                "medium",
                False,
                [],
            )

    try:
        asyncio.run(run())
    except HTTPException as exc:
        assert secret not in exc.detail
    else:
        raise AssertionError("OpenAI error should raise HTTPException")


def test_transport_error_never_contains_api_key(monkeypatch):
    secret = "google-transport-secret"

    async def fail_google(*args, **kwargs):
        request = httpx.Request("POST", f"https://example.test/generate?key={secret}")
        raise httpx.ConnectError(f"connection failed for {secret}", request=request)

    monkeypatch.setattr(sticker_ai, "_call_google", fail_google)
    response = client.post(
        "/api/sticker-ai/generate",
        data={
            "provider": "google",
            "api_key": secret,
            "model": "gemini-2.5-flash-image",
            "prompt": "test",
            "size": "1024x1024",
            "quality": "medium",
            "transparent": "false",
        },
    )

    assert response.status_code == 502
    assert secret not in response.json()["detail"]


def test_timeout_returns_504_without_retrying(monkeypatch):
    calls = 0

    async def timeout_google(*args, **kwargs):
        nonlocal calls
        calls += 1
        request = httpx.Request("POST", "https://example.test/generate")
        raise httpx.ReadTimeout("upstream timed out", request=request)

    monkeypatch.setattr(sticker_ai, "_call_google", timeout_google)
    response = client.post(
        "/api/sticker-ai/generate",
        data={
            "provider": "google",
            "api_key": "test-key",
            "model": "gemini-2.5-flash-image",
            "prompt": "test",
            "size": "1024x1024",
            "quality": "medium",
            "transparent": "false",
        },
    )

    assert response.status_code == 504
    assert "逾時" in response.json()["detail"]
    assert calls == 1
