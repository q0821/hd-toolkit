"""AI 貼圖生成 — 後端薄 proxy

把瀏覽器（key 存在使用者 localStorage）送來的請求，轉呼叫 OpenAI 或 Google
的圖像生成 API，再把產生的圖回傳。**key 只在這次請求的記憶體裡用一下、用完即丟，
不寫進任何 log、不存任何地方** —— 跟 pdf2jpg 收到 PDF 轉完即丟一樣。

需要 httpx（見 requirements.txt）。
"""

import base64
from dataclasses import dataclass
from io import BytesIO
from typing import Optional
import warnings

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError

router = APIRouter(tags=["sticker-ai"])

OPENAI_GENERATIONS = "https://api.openai.com/v1/images/generations"
OPENAI_EDITS = "https://api.openai.com/v1/images/edits"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/"

_TIMEOUT = httpx.Timeout(180.0, connect=20.0)

MAX_REFERENCES = 11
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024
MAX_IMAGE_EDGE = 4096
ALLOWED_IMAGE_FORMATS = {
    "PNG": "image/png",
    "JPEG": "image/jpeg",
    "WEBP": "image/webp",
}


@dataclass(frozen=True)
class ReferenceImage:
    filename: str
    content_type: str
    data: bytes


def _redact(value: str, *secrets: str) -> str:
    redacted = value
    for secret in secrets:
        if secret:
            redacted = redacted.replace(secret, "[REDACTED]")
    return redacted


def _upstream_error(resp: httpx.Response, who: str, *secrets: str) -> str:
    """把上游錯誤整理成一句不含 key 的訊息。"""
    msg = ""
    try:
        data = resp.json()
        err = data.get("error") if isinstance(data, dict) else None
        if isinstance(err, dict):
            msg = err.get("message") or err.get("status") or ""
        elif isinstance(err, str):
            msg = err
        if not msg and isinstance(data, dict):
            msg = str(data)[:300]
    except Exception:
        msg = (resp.text or "")[:300]
    return _redact(
        f"{who} API 回應錯誤（{resp.status_code}）：{msg}".strip(),
        *secrets,
    )


def _validate_reference_image(data: bytes) -> tuple[str, int, int]:
    if not data:
        raise HTTPException(status_code=400, detail="參考圖是空的。")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="每張參考圖不可超過 10 MB。")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(
                BytesIO(data),
                formats=tuple(ALLOWED_IMAGE_FORMATS),
            ) as image:
                image_format = image.format or ""
                width, height = image.size
                image.verify()
            with Image.open(
                BytesIO(data),
                formats=tuple(ALLOWED_IMAGE_FORMATS),
            ) as image:
                image.load()
    except (
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=400,
            detail="參考圖必須是有效的 PNG、JPEG 或 WebP 圖片。",
        ) from exc

    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise HTTPException(
            status_code=400,
            detail="參考圖必須是有效的 PNG、JPEG 或 WebP 圖片。",
        )
    if width < 1 or height < 1 or max(width, height) > MAX_IMAGE_EDGE:
        raise HTTPException(
            status_code=400,
            detail="參考圖任一邊不可超過 4096px。",
        )
    return ALLOWED_IMAGE_FORMATS[image_format], width, height


async def _read_references(files: list[UploadFile]) -> list[ReferenceImage]:
    if len(files) > MAX_REFERENCES:
        raise HTTPException(status_code=400, detail="一次最多 11 張參考圖（含畫風參考圖）。")

    references: list[ReferenceImage] = []
    total_bytes = 0
    for index, upload in enumerate(files, start=1):
        remaining_total = MAX_TOTAL_IMAGE_BYTES - total_bytes
        read_limit = min(MAX_IMAGE_BYTES, remaining_total)
        data = await upload.read(read_limit + 1)
        if len(data) > read_limit:
            if remaining_total < MAX_IMAGE_BYTES:
                detail = "參考圖總大小不可超過 40 MB。"
            else:
                detail = "每張參考圖不可超過 10 MB。"
            raise HTTPException(status_code=400, detail=detail)
        total_bytes += len(data)
        content_type, _, _ = _validate_reference_image(data)
        references.append(ReferenceImage(
            filename=upload.filename or f"reference-{index}.png",
            content_type=content_type,
            data=data,
        ))
    return references


async def _call_openai(
    client: httpx.AsyncClient, key: str, model: str, prompt: str, size: str,
    quality: str, transparent: bool, references: list[ReferenceImage],
) -> bytes:
    headers = {"Authorization": f"Bearer {key}"}
    if references:
        data = {"model": model, "prompt": prompt, "size": size, "quality": quality}
        if transparent:
            data["background"] = "transparent"
        files = [
            ("image[]", (ref.filename, ref.data, ref.content_type))
            for ref in references
        ]
        resp = await client.post(OPENAI_EDITS, headers=headers, data=data, files=files)
    else:
        body = {"model": model, "prompt": prompt, "size": size, "quality": quality}
        if transparent:
            body["background"] = "transparent"
        resp = await client.post(OPENAI_GENERATIONS, headers={**headers, "Content-Type": "application/json"}, json=body)
    if resp.status_code >= 400:
        detail = _upstream_error(resp, "OpenAI", key)
        low = detail.lower()
        if resp.status_code == 400 and "transparent" in low:
            detail += "（這個模型不支援透明背景，請改用「綠幕去背」背景模式，或改用支援透明背景的其他服務）"
        elif resp.status_code == 403 and "verif" in low:
            detail += "（請到 OpenAI 後台 platform.openai.com/settings/organization/general 完成 API 組織驗證，或改用 Google）"
        raise HTTPException(status_code=resp.status_code if resp.status_code < 500 else 502, detail=detail)
    try:
        b64 = resp.json()["data"][0]["b64_json"]
    except Exception:
        raise HTTPException(status_code=502, detail="OpenAI 沒有回傳圖片資料。")
    return base64.b64decode(b64)


async def _call_google(
    client: httpx.AsyncClient, key: str, model: str, prompt: str,
    references: list[ReferenceImage],
) -> tuple[bytes, str]:
    parts: list = [{"text": prompt}]
    parts.extend({"inline_data": {
        "mime_type": ref.content_type,
        "data": base64.b64encode(ref.data).decode("ascii"),
    }} for ref in references)
    body = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
    url = GEMINI_BASE + model + ":generateContent"
    resp = await client.post(url, headers={"x-goog-api-key": key, "Content-Type": "application/json"}, json=body)
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code if resp.status_code < 500 else 502,
            detail=_upstream_error(resp, "Google", key),
        )
    data = resp.json()
    text_note = ""
    for cand in data.get("candidates", []) or []:
        for part in (cand.get("content", {}) or {}).get("parts", []) or []:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
                return base64.b64decode(inline["data"]), mime
            if part.get("text"):
                text_note = part["text"]
    safe_note = _redact(text_note[:160], key)
    raise HTTPException(status_code=502, detail="Google 模型沒有回傳圖片" + (f"：{safe_note}" if safe_note else "（可能是內容被擋或模型不支援生圖）。"))


@router.post("/api/sticker-ai/generate")
async def generate(
    provider: str = Form(...),
    api_key: str = Form(...),
    model: str = Form(...),
    prompt: str = Form(...),
    size: str = Form("1024x1024"),
    quality: str = Form("medium"),
    transparent: bool = Form(False),
    reference: Optional[list[UploadFile]] = File(None),
):
    """把生圖請求轉給選定的 AI 服務，回傳一張 PNG（或模型給的格式）。"""
    api_key = (api_key or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="未提供 API key。")
    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="提示文字是空的。")
    if provider not in ("openai", "google"):
        raise HTTPException(status_code=400, detail=f"未知的 provider：{provider}")
    references = await _read_references(reference or [])

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            if provider == "openai":
                png = await _call_openai(client, api_key, model, prompt, size, quality, transparent, references)
                return Response(content=png, media_type="image/png")
            data, mime = await _call_google(client, api_key, model, prompt, references)
            return Response(content=data, media_type=mime if mime.startswith("image/") else "image/png")
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="連線 AI 服務逾時，請稍後再試。")
    except httpx.HTTPError as e:  # noqa: BLE001 - 連線層錯誤一律回 502
        detail = _redact(f"連線 AI 服務失敗：{e}", api_key)
        raise HTTPException(status_code=502, detail=detail)
