"""AI 貼圖生成 — 後端薄 proxy

把瀏覽器（key 存在使用者 localStorage）送來的請求，轉呼叫 OpenAI 或 Google
的圖像生成 API，再把產生的圖回傳。**key 只在這次請求的記憶體裡用一下、用完即丟，
不寫進任何 log、不存任何地方** —— 跟 pdf2jpg 收到 PDF 轉完即丟一樣。

需要 httpx（見 requirements.txt）。
"""

import base64
from typing import Optional

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter(tags=["sticker-ai"])

OPENAI_GENERATIONS = "https://api.openai.com/v1/images/generations"
OPENAI_EDITS = "https://api.openai.com/v1/images/edits"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/"

_TIMEOUT = httpx.Timeout(180.0, connect=20.0)


def _upstream_error(resp: httpx.Response, who: str) -> str:
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
    return f"{who} API 回應錯誤（{resp.status_code}）：{msg}".strip()


async def _call_openai(
    client: httpx.AsyncClient, key: str, model: str, prompt: str, size: str,
    quality: str, transparent: bool, ref: Optional[UploadFile], ref_bytes: Optional[bytes],
) -> bytes:
    headers = {"Authorization": f"Bearer {key}"}
    if ref_bytes:
        data = {"model": model, "prompt": prompt, "size": size, "quality": quality}
        if transparent:
            data["background"] = "transparent"
        files = {"image[]": (ref.filename or "reference.png", ref_bytes, ref.content_type or "image/png")}
        resp = await client.post(OPENAI_EDITS, headers=headers, data=data, files=files)
    else:
        body = {"model": model, "prompt": prompt, "size": size, "quality": quality}
        if transparent:
            body["background"] = "transparent"
        resp = await client.post(OPENAI_GENERATIONS, headers={**headers, "Content-Type": "application/json"}, json=body)
    if resp.status_code >= 400:
        detail = _upstream_error(resp, "OpenAI")
        low = detail.lower()
        if resp.status_code == 400 and "transparent" in low:
            detail += "（這個模型不支援透明背景 —— 改用「綠幕去背」背景模式，或把模型換成 gpt-image-1）"
        elif resp.status_code == 403 and "verif" in low:
            detail += "（到 OpenAI 後台 platform.openai.com/settings/organization/general 做組織驗證，或先用 gpt-image-1 / Google）"
        raise HTTPException(status_code=resp.status_code if resp.status_code < 500 else 502, detail=detail)
    try:
        b64 = resp.json()["data"][0]["b64_json"]
    except Exception:
        raise HTTPException(status_code=502, detail="OpenAI 沒有回傳圖片資料。")
    return base64.b64decode(b64)


async def _call_google(
    client: httpx.AsyncClient, key: str, model: str, prompt: str,
    ref: Optional[UploadFile], ref_bytes: Optional[bytes],
) -> tuple[bytes, str]:
    parts: list = [{"text": prompt}]
    if ref_bytes:
        parts.append({"inline_data": {
            "mime_type": ref.content_type or "image/jpeg",
            "data": base64.b64encode(ref_bytes).decode("ascii"),
        }})
    body = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
    url = GEMINI_BASE + model + ":generateContent"
    resp = await client.post(url, headers={"x-goog-api-key": key, "Content-Type": "application/json"}, json=body)
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code if resp.status_code < 500 else 502, detail=_upstream_error(resp, "Google"))
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
    raise HTTPException(status_code=502, detail="Google 模型沒有回傳圖片" + (f"：{text_note[:160]}" if text_note else "（可能是內容被擋或模型不支援生圖）。"))


@router.post("/api/sticker-ai/generate")
async def generate(
    provider: str = Form(...),
    api_key: str = Form(...),
    model: str = Form(...),
    prompt: str = Form(...),
    size: str = Form("1024x1024"),
    quality: str = Form("medium"),
    transparent: bool = Form(False),
    reference: Optional[UploadFile] = File(None),
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
    ref_bytes = await reference.read() if reference is not None else None
    if ref_bytes is not None and len(ref_bytes) == 0:
        ref_bytes = None
        reference = None

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            if provider == "openai":
                png = await _call_openai(client, api_key, model, prompt, size, quality, transparent, reference, ref_bytes)
                return Response(content=png, media_type="image/png")
            data, mime = await _call_google(client, api_key, model, prompt, reference, ref_bytes)
            return Response(content=data, media_type=mime if mime.startswith("image/") else "image/png")
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="連線 AI 服務逾時，請稍後再試。")
    except httpx.HTTPError as e:  # noqa: BLE001 - 連線層錯誤一律回 502
        raise HTTPException(status_code=502, detail=f"連線 AI 服務失敗：{e}")
