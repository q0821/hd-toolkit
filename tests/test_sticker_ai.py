from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def _page() -> str:
    response = client.get("/sticker-ai")
    assert response.status_code == 200
    return response.text


def test_sticker_page_defaults_to_quick_openai_gpt_image_2():
    body = _page()
    assert 'data-workflow="quick" aria-pressed="true"' in body
    assert 'data-provider="openai" aria-pressed="true"' in body
    assert 'data-provider="google" aria-pressed="false"' in body
    assert '<option value="gpt-image-2" selected>' in body


def test_sticker_page_preserves_green_screen_and_auto_size_defaults():
    body = _page()
    assert 'data-bg="chroma" aria-pressed="true"' in body
    assert 'data-fit="auto" aria-pressed="true"' in body
    assert 'id="chromaSlider"' in body
    assert 'id="padSlider"' in body


def test_sticker_page_exposes_quick_and_character_project_modes():
    body = _page()
    assert 'id="workflowSeg"' in body
    assert 'data-workflow="quick"' in body
    assert 'data-workflow="project"' in body
    assert 'id="referenceSlots"' in body
    assert 'data-angle="front"' in body
    assert 'data-angle="top"' in body
    assert 'data-angle="bottom"' in body
    assert 'data-angle="left"' in body
    assert 'data-angle="right"' in body
    assert 'data-angle="extra1"' in body
    assert 'data-angle="extra5"' in body


def test_sticker_page_exposes_ai_and_no_text_modes():
    body = _page()
    assert 'data-title="ai" aria-pressed="true"' in body
    assert 'data-title="none" aria-pressed="false"' in body
    assert 'id="textStyleRow"' in body
    assert 'data-title="overlay"' not in body
    assert 'data-title="customarea"' not in body


def test_sticker_page_exposes_character_project_controls():
    body = _page()
    assert 'id="characterFields"' in body
    assert 'id="fixedTraits"' in body
    assert 'id="fixedAccessories"' in body
    assert 'id="defaultOutfit"' in body
    assert 'id="generateCharacterBtn"' in body
    assert 'id="approveCharacterBtn"' in body
    assert 'id="exportCharacterBtn"' in body
    assert 'id="importCharacterInput"' in body


def test_sticker_page_loads_character_project_module():
    body = _page()
    assert '<script src="/static/sticker-ai/character-project.js?v=1.0.14"></script>' in body

def test_sticker_page_exposes_visual_style_reference_controls():
    body = _page()
    assert 'id="styleSeg"' in body
    assert body.count('data-style="') == 6
    assert 'class="style-card__preview"' in body
    assert 'id="styleReferenceInput"' in body
    assert "補充畫風描述（進階，可選）" in body


def test_deprecated_models_are_not_recommended_in_error_guidance():
    body = _page()
    assert "換成 gpt-image-1.5 / gpt-image-1" not in body
    assert "先用 gpt-image-1 / Google" not in body
