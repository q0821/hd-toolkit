# AI 貼圖角色專案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 AI 貼圖工具擴充為支援單次多角度參考、可重用角色專案、角色定稿與角色檔，以及 AI 風格化雙段文字的完整流程。

**Architecture:** 保留 FastAPI 薄代理與單頁工具架構。後端把單一 `UploadFile` 擴充為最多六張經實際解碼驗證的參考圖，分別轉成 OpenAI 多個 `image[]` 或 Google 多個 `inline_data`。前端新增無相依套件的 `character-project.js`，集中管理角色狀態、文字分段、批次解析與角色檔 manifest 契約；頁面本身負責 DOM、Canvas、JSZip 封存與產生流程。

**Tech Stack:** Python 3、FastAPI、httpx、Pillow 12、pytest、原生 JavaScript、Node.js 內建 `node:test`、Canvas、JSZip 3.10.1。

## Global Constraints

- 單次貼圖接受一至五張參考圖；角色專案固定五張；單張嚴格參考共六張。
- OpenAI 是預設供應商，預設模型固定為 `gpt-image-2`；Google 保留為手動替代選項。
- 不提供 seed，不宣稱可重現相同像素結果。
- 角色檔為 `.hd-character.zip`，不得包含 API key，匯入必須完整驗證後原子套用。
- 角色定稿圖、固定特徵、固定配件與插畫風格形成角色身分基準；基準變更後確認失效。
- 文字模式只有「讓 AI 畫文字」與「不產生文字」；AI 文字最多兩段，不提供固定上下／左右版位。
- 圖片產生不得自動重試；手動重試須提示可能再次計費。
- 不新增資料庫、帳號、雲端角色庫、伺服器端持久化或新 AI 供應商。
- 不修改 LINE 圖片尺寸、背景去除策略、透明度遮罩清理與貼圖 ZIP 命名。
- 不部署、不 commit、不 push；等使用者明確說「收尾」再處理版本控制。

---

### Task 1: 多參考圖代理與伺服器端圖片驗證

**Files:**
- Modify: `requirements.txt`
- Modify: `app/tools/sticker_ai.py`
- Create: `tests/test_sticker_ai_api.py`

**Interfaces:**
- Consumes: 重複 multipart `reference` 欄位、既有 `provider/api_key/model/prompt/size/quality/transparent` 欄位。
- Produces: `ReferenceImage`、`_read_references()`、`_validate_reference_image()`，以及接受零至六張參考圖的 `_call_openai()`、`_call_google()` 與 `/api/sticker-ai/generate`。

- [ ] **Step 1: 加入 Pillow 執行階段相依套件**

在 `requirements.txt` 加入：

```text
Pillow>=12.0.0
```

- [ ] **Step 2: 先寫多參考圖與驗證失敗測試**

建立 `tests/test_sticker_ai_api.py`，使用固定的小型 PNG bytes 與 `TestClient`，至少包含：

```python
def test_generate_rejects_more_than_six_references(): ...
def test_generate_rejects_non_image_reference(): ...
def test_generate_rejects_oversized_reference(monkeypatch): ...
def test_openai_edit_sends_repeated_image_parts(): ...
def test_google_generation_sends_all_inline_images(): ...
def test_no_reference_uses_openai_generations_endpoint(): ...
def test_upstream_error_never_contains_api_key(): ...
```

`test_openai_edit_sends_repeated_image_parts` 直接以 `httpx.MockTransport` 呼叫 `_call_openai()`，斷言 multipart body 有兩個 `name="image[]"`。Google 測試解析送出的 JSON，斷言兩個 `inline_data` 與一個文字 part。

- [ ] **Step 3: 執行測試確認紅燈**

Run：

```bash
uv --cache-dir /tmp/hd-toolkit-uv run --with-requirements requirements-dev.txt pytest tests/test_sticker_ai_api.py -q
```

Expected：因 `ReferenceImage`、多檔參數或驗證函式不存在而失敗。

- [ ] **Step 4: 實作參考圖值物件與驗證**

在後端加入：

```python
@dataclass(frozen=True)
class ReferenceImage:
    filename: str
    content_type: str
    data: bytes

MAX_REFERENCES = 6
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_EDGE = 4096
ALLOWED_IMAGE_FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
```

`_validate_reference_image(data: bytes) -> tuple[str, int, int]` 使用 `Image.open(BytesIO(data), formats=["PNG", "JPEG", "WEBP"])`、`verify()`、重新開啟後 `load()`，並拒絕不支援格式、空檔、超過 10MB、任一邊超過 4096px、Pillow 解壓炸彈警告與損毀圖片。

`_read_references(files: list[UploadFile]) -> list[ReferenceImage]` 逐張讀取與驗證，將錯誤轉成不含原始 bytes 或 API key 的繁體中文 `HTTPException(400)`。

- [ ] **Step 5: 實作供應商多檔轉送**

OpenAI 使用：

```python
files = [
    ("image[]", (ref.filename, ref.data, ref.content_type))
    for ref in references
]
```

Google 使用：

```python
parts = [{"text": prompt}]
parts.extend({
    "inline_data": {
        "mime_type": ref.content_type,
        "data": base64.b64encode(ref.data).decode("ascii"),
    }
} for ref in references)
```

路由參數改成 `reference: Optional[list[UploadFile]] = File(None)`，正規化為空陣列後呼叫驗證。只有 OpenAI 且沒有參考圖時走 `/v1/images/generations`。

- [ ] **Step 6: 執行 API 測試與既有貼圖測試**

Run：

```bash
uv --cache-dir /tmp/hd-toolkit-uv run --with-requirements requirements-dev.txt pytest tests/test_sticker_ai_api.py tests/test_sticker_ai.py -q
```

Expected：全部通過，錯誤訊息不包含測試 API key。

---

### Task 2: 角色狀態、文字分段與角色檔 manifest 核心

**Files:**
- Create: `static/sticker-ai/character-project.js`
- Create: `tests/sticker_character.test.js`
- Modify: `static/sticker-ai/index.html`

**Interfaces:**
- Consumes: 原始文字、模式、角色專案欄位與 manifest JSON。
- Produces: `window.StickerCharacter`，同時可由 Node.js `require()` 載入；公開 `splitCaption()`、`parseBulkEntries()`、`nextFinalizationStatus()`、`createManifest()`、`validateManifest()` 與常數。

- [ ] **Step 1: 先寫純函式測試**

建立 Node.js 內建測試：

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const Character = require("../static/sticker-ai/character-project.js");

test("splitCaption accepts one or two non-empty segments", () => {
  assert.deepEqual(Character.splitCaption("辛苦了\n你最棒"), ["辛苦了", "你最棒"]);
});

test("splitCaption rejects more than two segments", () => {
  assert.throws(() => Character.splitCaption("一\n二\n三"), /最多兩段/);
});

test("bulk text mode decodes literal newline", () => {
  assert.deepEqual(
    Character.parseBulkEntries("辛苦了\\n你最棒|雙手比讚", "ai").entries[0],
    { title: "辛苦了\n你最棒", desc: "雙手比讚" }
  );
});

test("no-text bulk mode treats each line as an action", () => {
  assert.deepEqual(
    Character.parseBulkEntries("揮手\n比讚", "none").entries,
    [{ title: "", desc: "揮手" }, { title: "", desc: "比讚" }]
  );
});

test("identity changes invalidate an approved finalization", () => {
  assert.equal(Character.nextFinalizationStatus("approved", "style"), "invalidated");
  assert.equal(Character.nextFinalizationStatus("approved", "defaultOutfit"), "approved");
});
```

再加入 manifest 版本、必要欄位、未知版本與未知供應商測試。

- [ ] **Step 2: 執行 Node.js 測試確認紅燈**

Run：

```bash
node --test tests/sticker_character.test.js
```

Expected：模組不存在。

- [ ] **Step 3: 實作無 DOM 相依的 UMD 核心**

模組輸出：

```javascript
{
  SCHEMA_VERSION: 1,
  MAX_CAPTION_SEGMENTS: 2,
  IDENTITY_FIELDS: ["references", "fixedTraits", "fixedAccessories", "style"],
  splitCaption,
  parseBulkEntries,
  nextFinalizationStatus,
  createManifest,
  validateManifest
}
```

`validateManifest()` 必須 fail-fast，拒絕非物件、未知 `schema_version`、未知供應商、空模型、缺少角色欄位與錯誤 references mapping；不可替缺少欄位偷偷填預設值。

- [ ] **Step 4: 在頁面以 cache-bust 載入模組**

在 JSZip 後、頁面 inline script 前加入：

```html
<script src="/static/sticker-ai/character-project.js?v=1.0.0"></script>
```

- [ ] **Step 5: 執行純函式測試**

Run：

```bash
node --test tests/sticker_character.test.js
```

Expected：全部通過。

---

### Task 3: 單次貼圖多角度輸入與 AI 文字模式

**Files:**
- Modify: `static/sticker-ai/index.html`
- Modify: `tests/test_sticker_ai.py`

**Interfaces:**
- Consumes: `StickerCharacter.parseBulkEntries()`、最多五個前端 PNG Blob、現有貼圖 entry 清單。
- Produces: 頂層 `quick/project` 模式、單次多角度 reference state、`ai/none` 文字模式、整批文字風格與多檔 FormData。

- [ ] **Step 1: 先更新穩定頁面契約測試**

既有測試只保留穩定 markup 契約，改成驗證：

```python
def test_sticker_page_defaults_to_quick_openai_gpt_image_2(): ...
def test_sticker_page_exposes_quick_and_character_project_modes(): ...
def test_sticker_page_exposes_ai_and_no_text_modes(): ...
def test_sticker_page_loads_character_project_module(): ...
```

刪除針對內部變數、函式片段與原始碼順序的舊斷言。

- [ ] **Step 2: 執行頁面測試確認紅燈**

Run：

```bash
uv --cache-dir /tmp/hd-toolkit-uv run --with-requirements requirements-dev.txt pytest tests/test_sticker_ai.py -q
```

Expected：找不到新模式與腳本標記。

- [ ] **Step 3: 新增模式與五角度上傳 UI**

控制區最前方新增「快速做一組貼圖／建立可重用角色」 segmented。參考圖區改成主要參考、上方視角、下方視角、左側、右側五個可聚焦上傳卡；快速模式只要求主要參考圖，角色模式要求五張。

每張圖各自顯示預覽、檔名、正規化尺寸與移除按鈕。沿用現有 Canvas 重新編碼函式，輸出 PNG、最長邊 1024px。拖放與檔案選擇都必須指向明確角度，不接受一次無標籤塞入多張。

- [ ] **Step 4: 更新預設供應商與文字控制**

OpenAI segmented 預設 `aria-pressed="true"`，Google 預設 false；OpenAI pane 預設顯示。文字模式只保留：

```text
讓 AI 畫文字
不產生文字
```

AI 模式顯示整批文字風格 segmented：手寫、可愛圓體、粗筆、漫畫標題。個別標題欄改為最多兩行的 textarea；不產生文字時隱藏或停用但保留 state。

- [ ] **Step 5: 更新批次解析與 prompt**

AI 模式透過 `StickerCharacter.parseBulkEntries(raw, "ai")` 解析 `文字|動作` 與字面值 `\n`。不產生文字透過 `parseBulkEntries(raw, "none")`，每行直接是動作。

`buildPrompt()` 依供應商中立的文字模式加入：精確保留每段內容與順序、可依構圖放在上下／左右／不同對話框、文字不可裁切。無文字模式完全不送 title，並要求不產生字元、數字或 placeholder。

- [ ] **Step 6: 送出多張快速模式參考圖**

`generateOne(entry, options)` 將目前模式應使用的 references 逐張加入同名 `reference` FormData 欄位。快速模式為一至五張；沒有參考圖時維持純文字產生。

- [ ] **Step 7: 執行 Node.js 與 Python 測試**

Run：

```bash
node --test tests/sticker_character.test.js
uv --cache-dir /tmp/hd-toolkit-uv run --with-requirements requirements-dev.txt pytest tests/test_sticker_ai.py tests/test_sticker_ai_api.py -q
```

Expected：全部通過。

---

### Task 4: 角色定稿狀態與角色專案產生流程

**Files:**
- Modify: `static/sticker-ai/index.html`
- Modify: `static/sticker-ai/character-project.js`
- Modify: `tests/sticker_character.test.js`

**Interfaces:**
- Consumes: 五張角色參考圖、固定角色特徵、固定配件、預設服裝、插畫風格與 AI API。
- Produces: `finalization.status`、角色定稿 Blob、確認／重新產生操作、一般角色專案 references 與單張嚴格參考 references。

- [ ] **Step 1: 擴充狀態轉換測試**

加入完整狀態測試：

```javascript
test("only identity fields invalidate approval", () => { ... });
test("generation failure never produces approved status", () => { ... });
test("imported validated project restores approved status", () => { ... });
```

- [ ] **Step 2: 執行測試確認紅燈**

Run：`node --test tests/sticker_character.test.js`

Expected：新狀態事件未支援。

- [ ] **Step 3: 新增角色欄位與定稿控制**

角色模式顯示固定角色特徵、固定配件、預設服裝輸入欄位，以及「產生角色定稿圖」按鈕。定稿預覽顯示等待確認、已確認、確認已失效與錯誤狀態；提供「確認角色」與「重新產生」。

固定欄位或任一五角度圖片變更時呼叫 `nextFinalizationStatus()`。未確認時停用整組貼圖產生按鈕。

- [ ] **Step 4: 實作角色定稿 prompt 與請求**

定稿 prompt 固定要求：所選插畫風格、單一角色、正面或微側全身、中性姿勢與表情、簡單純色背景、無任何文字，清楚保存固定特徵與配件。一次附上五張角度圖，成功後狀態為等待確認，不自動確認。

- [ ] **Step 5: 接入一般與嚴格參考**

一般角色專案產生每張貼圖只附角色定稿圖。每張結果的「重生這張」旁新增「嚴格參考」選項；只有勾選後的該次重新產生附角色定稿圖加五張原圖。任何產生請求都不自動重試，錯誤提示加入可能再次計費說明。

- [ ] **Step 6: 執行測試與瀏覽器初步 smoke**

Run：

```bash
node --test tests/sticker_character.test.js
uv --cache-dir /tmp/hd-toolkit-uv run --with-requirements requirements-dev.txt pytest tests/test_sticker_ai.py tests/test_sticker_ai_api.py -q
```

瀏覽器 smoke：驗證少一張角度圖不能產生定稿、五張齊全可送出、未確認不能產生貼圖、固定特徵變更後確認失效。

---

### Task 5: 角色檔匯出、原子匯入與隱私提示

**Files:**
- Modify: `static/sticker-ai/index.html`
- Modify: `static/sticker-ai/character-project.js`
- Modify: `tests/sticker_character.test.js`

**Interfaces:**
- Consumes: JSZip 3.10.1、`StickerCharacter.createManifest()`、角色定稿 Blob、五張正規化 PNG。
- Produces: `.hd-character.zip` 下載、經完整驗證的 imported project object，以及 UI 原子套用。

- [ ] **Step 1: 加入 manifest 正反例測試**

測試必要欄位、`schema_version: 1`、`provider`、`model`、五個 reference keys、空固定特徵、未知新版與無效 references mapping。API key 不在任何 manifest 欄位。

- [ ] **Step 2: 執行測試確認紅燈**

Run：`node --test tests/sticker_character.test.js`

Expected：嚴格 manifest 驗證案例尚未通過。

- [ ] **Step 3: 實作角色檔匯出**

確認狀態為已確認時才允許下載。以 JSZip 建立七個白名單 entries：

```text
manifest.json
character.png
references/front.png
references/top.png
references/bottom.png
references/left.png
references/right.png
```

檔名格式為 `<安全化角色名稱>.hd-character.zip`。manifest 僅含規格欄位，不讀取 Settings/localStorage，因此不可能包含 API key。

- [ ] **Step 4: 實作完整驗證後原子匯入**

匯入前檢查壓縮檔不超過 40MB。載入 JSZip 後只接受七個白名單檔案，拒絕目錄以外、遺漏或額外 entries；`manifest.json` 不超過 256KB；所有展開內容總計不超過 50MB；所有圖片轉 Blob 後以瀏覽器 `Image` 實際解碼並確認最長邊不超過 1024px。

先建立完整的暫存 project object，所有檢查通過後才呼叫單一 `applyImportedProject(project)` 更新 state 與 DOM。失敗只顯示錯誤，不清除目前專案。

- [ ] **Step 5: 加入資料傳遞與角色檔隱私提示**

上傳區說明圖片會經本站代理傳給所選 AI 供應商；角色檔下載區說明檔案含原始照片、不含 API key，應妥善保管。

- [ ] **Step 6: 執行測試**

Run：

```bash
node --test tests/sticker_character.test.js
uv --cache-dir /tmp/hd-toolkit-uv run --with-requirements requirements-dev.txt pytest tests/test_sticker_ai.py tests/test_sticker_ai_api.py -q
```

Expected：全部通過。

---

### Task 6: 文件、完整驗證與 Preflight 自查

**Files:**
- Modify: `README.md`
- Verify: `docs/superpowers/specs/2026-08-08-sticker-ai-character-project-design.md`

**Interfaces:**
- Consumes: 完整功能與 spec 的 Preflight Checklist。
- Produces: 更新後工具說明、全套測試證據與瀏覽器 smoke 證據。

- [ ] **Step 1: 更新 README 工具說明與目錄結構**

AI 貼圖段落改為：單次一至五張參考圖、角色專案五角度定稿、角色檔匯入與匯出、OpenAI `gpt-image-2` 預設、Google 替代、AI 雙段文字與不產生文字模式。目錄加入 `character-project.js` 的用途。

- [ ] **Step 2: 執行完整 Python 與 JavaScript 測試**

Run：

```bash
node --test tests/sticker_character.test.js
uv --cache-dir /tmp/hd-toolkit-uv run --with-requirements requirements-dev.txt pytest -q
```

Expected：全部通過，無付費 AI 呼叫。

- [ ] **Step 3: 啟動本機服務**

Run：

```bash
uv --cache-dir /tmp/hd-toolkit-uv run --with-requirements requirements-dev.txt uvicorn main:app --host 127.0.0.1 --port 8000
```

使用受控長時間程序啟動，確認 `/sticker-ai` 可載入且瀏覽器 console 無錯誤。

- [ ] **Step 4: 執行完整瀏覽器 smoke test**

以本地 API 測試替身避免付費呼叫，實際操作並確認：

```text
快速模式：1 張與 5 張參考圖 → AI 雙段文字 → 產生結果
無文字模式：批次動作輸入 → 請求不含 title
角色模式：缺圖阻擋 → 5 張定稿 → 確認 → 一般貼圖
角色失效：修改固定特徵 → 阻擋貼圖 → 重新定稿
角色檔：匯出 → 清空目前狀態 → 匯入 → 還原已確認狀態
嚴格參考：只重生單張且送出 6 張 reference
輸出：結果預覽、main.png、tab.png、貼圖 ZIP
```

- [ ] **Step 5: 核對 Preflight Checklist**

逐項確認：無資料庫改動、無持久化、圖片與角色檔限制、API key 不進檔案或錯誤、外部請求不自動重試、物件 URL 釋放、FastAPI 契約測試與瀏覽器 smoke 完成。

- [ ] **Step 6: 保留變更等待使用者「收尾」**

不 commit、不 push。回報修改檔案、測試命令與瀏覽器實際操作結果。
