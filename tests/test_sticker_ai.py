from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def _page() -> str:
    response = client.get("/sticker-ai")
    assert response.status_code == 200
    return response.text


def test_entry_columns_have_persistent_labels():
    body = _page()
    assert "表情 / 動作描述" in body
    assert "貼圖顯示文字" in body
    assert body.index(">貼圖顯示文字</span>") < body.index(">表情 / 動作描述</span>")
    assert 'aria-label", "表情 / 動作描述"' in body
    assert 'aria-label", "貼圖顯示文字"' in body
    assert 'pad2(i + 1)), t, d, rm' in body


def test_bulk_paste_uses_title_then_action_format():
    body = _page()
    assert "批次貼上（每行：標題|動作說明）" in body
    assert "嗨|笑著揮手打招呼" in body
    assert "套用並取代目前清單" in body
    assert 'var separator = line.indexOf("|")' in body
    assert "line.slice(0, separator).trim()" in body
    assert "line.slice(separator + 1).trim()" in body


def test_bulk_paste_validates_input_before_replacing_entries():
    body = _page()
    invalid_check = body.index("if (parsed.invalidLines.length)")
    empty_check = body.index("if (!parsed.entries.length)")
    limit_check = body.index("if (parsed.entries.length > MAX_ENTRIES)")
    assignment = body.index("state.entries = parsed.entries")
    assert invalid_check < assignment
    assert empty_check < assignment
    assert limit_check < assignment
    assert "invalidLines.push(i + 1)" in body
    assert "一次最多可套用 " in body


def test_bulk_paste_is_disabled_while_generating():
    body = _page()
    assert "els.bulkEntries.disabled = state.busy" in body
    assert "els.bulkApplyBtn.disabled = state.busy" in body


def test_openai_model_picker_uses_current_image_models():
    body = _page()
    assert '<option value="gpt-image-2" selected>' in body
    assert '<option value="gpt-image-2-2026-04-21">' in body
    assert '<option value="gpt-image-1.5"' not in body
    assert '<option value="gpt-image-1"' not in body


def test_custom_openai_model_falls_back_to_current_default():
    body = _page()
    assert 'els.openaiModelCustom.value.trim() || "gpt-image-2"' in body


def test_deprecated_models_are_not_recommended_in_error_guidance():
    body = _page()
    assert "換成 gpt-image-1.5 / gpt-image-1" not in body
    assert "先用 gpt-image-1 / Google" not in body
