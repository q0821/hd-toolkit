(function () {
  "use strict";

  var ENDPOINT = "/api/sticker-ai/generate";
  var ST_MAX_W = 370;
  var ST_MAX_H = 320;
  var SQUARE = 320;
  var MAIN = 240;
  var TAB_W = 96;
  var TAB_H = 74;
  var MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
  var PROMPT_VERSION = StickerCharacter.CURRENT_PROMPT_VERSION;
  var ANGLES = ["front", "top", "bottom", "left", "right", "extra1", "extra2", "extra3", "extra4", "extra5"];
  var ANGLE_NAMES = {
    front: "正面",
    top: "上方視角",
    bottom: "下方視角",
    left: "左側",
    right: "右側",
    extra1: "補充參考 1",
    extra2: "補充參考 2",
    extra3: "補充參考 3",
    extra4: "補充參考 4",
    extra5: "補充參考 5",
  };
  var TEXT_STYLES = {
    handwritten: "自然手寫字，筆畫有活力但清楚可讀",
    rounded: "可愛圓體字，圓潤、飽滿、清楚可讀",
    brush: "粗筆手繪字，筆畫厚實、清楚可讀",
    comic: "漫畫標題字，有俐落外框、清楚可讀",
  };

  var state = {
    workflow: "quick",
    provider: "openai",
    style: "sticker",
    styleExtra: "",
    styleReference: { custom: false, blob: null, url: "", name: "" },
    entries: [{ title: "", desc: "" }],
    titleMode: "ai",
    textStyle: "handwritten",
    bg: "chroma",
    size: "auto",
    pad: 10,
    promptVersion: PROMPT_VERSION,
    references: {},
    character: { status: "empty", blob: null, url: "", imported: false },
    outputs: [],
    busy: false,
  };
  var builtinStyleReferenceCache = {};

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    workflowSeg: $("workflowSeg"), workflowNote: $("workflowNote"), referenceSlots: $("referenceSlots"),
    referenceCompleteness: $("referenceCompleteness"),
    characterFields: $("characterFields"), characterName: $("characterName"), fixedTraits: $("fixedTraits"),
    fixedAccessories: $("fixedAccessories"), defaultOutfit: $("defaultOutfit"),
    generateCharacterBtn: $("generateCharacterBtn"), approveCharacterBtn: $("approveCharacterBtn"),
    exportCharacterBtn: $("exportCharacterBtn"), importCharacterBtn: $("importCharacterBtn"),
    importCharacterInput: $("importCharacterInput"), characterPreview: $("characterPreview"),
    characterPreviewImage: $("characterPreviewImage"), characterStatus: $("characterStatus"),
    entries: $("entries"), bulkEntries: $("bulkEntries"), bulkApplyBtn: $("bulkApplyBtn"),
    addEntryBtn: $("addEntryBtn"), styleSeg: $("styleSeg"), styleExtra: $("styleExtra"),
    styleReferenceInput: $("styleReferenceInput"), styleReferencePickBtn: $("styleReferencePickBtn"),
    styleReferencePreview: $("styleReferencePreview"), styleReferenceName: $("styleReferenceName"),
    styleReferenceRemoveBtn: $("styleReferenceRemoveBtn"), styleReferenceStatus: $("styleReferenceStatus"),
    providerSeg: $("providerSeg"), paneOpenai: $("paneOpenai"), paneGoogle: $("paneGoogle"),
    openaiModel: $("openaiModel"), openaiModelCustom: $("openaiModelCustom"), openaiQuality: $("openaiQuality"),
    googleModel: $("googleModel"), googleModelCustom: $("googleModelCustom"), planNote: $("planNote"),
    bgSeg: $("bgSeg"), chromaRow: $("chromaRow"), chromaSlider: $("chromaSlider"), chromaVal: $("chromaVal"),
    fitSeg: $("fitSeg"), padSlider: $("padSlider"), padVal: $("padVal"), titleSeg: $("titleSeg"), textStyleRow: $("textStyleRow"),
    textStyleSeg: $("textStyleSeg"),
    keyStatus: $("keyStatus"), openSettingsBtn: $("openSettingsBtn"),
    goBtn: $("goBtn"), zipBtn: $("zipBtn"), clearBtn: $("clearBtn"),
    emptyState: $("emptyState"), resultPanel: $("resultPanel"), grid: $("grid"), progress: $("progress"),
    progressStatus: $("progressStatus"), progressBar: $("progressBar"),
    errorMsg: $("errorMsg"), errorText: $("errorText"), successMsg: $("successMsg"), successText: $("successText"),
  };

  function currentKey() {
    return window.Settings ? Settings.getKey(state.provider) : "";
  }

  function selectedModel() {
    if (state.provider === "openai") {
      return els.openaiModel.value === "__custom__" ? (els.openaiModelCustom.value.trim() || "gpt-image-2") : els.openaiModel.value;
    }
    return els.googleModel.value === "__custom__" ? (els.googleModelCustom.value.trim() || "gemini-2.5-flash-image") : els.googleModel.value;
  }
  function availableReferenceAngles() {
    return ANGLES.filter(function (angle) { return !!state.references[angle]; });
  }
  function syncReferenceCompleteness(summary) {
    summary = summary || StickerCharacter.referenceCompleteness(availableReferenceAngles());
    if (!summary.ready) {
      els.referenceCompleteness.textContent = "參考完整度：" + summary.label + "。";
      return;
    }
    var guidance = summary.level === "base"
      ? "可以建立角色；加入其他角度可提高一致性。"
      : summary.level === "better"
        ? "可以建立角色；繼續加入角度可提高一致性。"
        : "十張參考圖都已提供。";
    els.referenceCompleteness.textContent = "參考完整度：" + summary.label + "（" + summary.count + "/10）。" + guidance;
  }

  function showError(message) {
    els.errorText.textContent = message;
    els.errorMsg.classList.add("is-shown");
    els.successMsg.classList.remove("is-shown");
  }

  function showSuccess(message) {
    els.successText.textContent = message;
    els.successMsg.classList.add("is-shown");
    els.errorMsg.classList.remove("is-shown");
  }

  function hideMessages() {
    els.errorMsg.classList.remove("is-shown");
    els.successMsg.classList.remove("is-shown");
  }

  function safeName(name) {
    return (name || "character").trim().replace(/[\\/:*?\"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "character";
  }

  function setSegment(group, attribute, value) {
    var dataAttribute = attribute.replace(/[A-Z]/g, function (letter) { return "-" + letter.toLowerCase(); });
    group.querySelectorAll("[data-" + dataAttribute + "]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset[attribute] === value));
    });
  }

  function fileToDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("圖片解碼失敗。")); };
      image.src = src;
    });
  }

  function canvasToBlob(canvas, type) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("圖片編碼失敗。")); }, type || "image/png");
    });
  }

  async function normalizeImage(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type || "")) throw new Error("只接受 PNG、JPEG 或 WebP 圖片。");
    if (file.size > MAX_REFERENCE_BYTES) throw new Error("每張參考圖不可超過 10 MB。");
    var source = await fileToDataURL(file);
    var image = await loadImage(source);
    if (!image.naturalWidth || !image.naturalHeight || Math.max(image.naturalWidth, image.naturalHeight) > 4096) {
      throw new Error("參考圖尺寸無效，任一邊不可超過 4096px。");
    }
    var scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    var width = Math.max(1, Math.round(image.naturalWidth * scale));
    var height = Math.max(1, Math.round(image.naturalHeight * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    return { blob: await canvasToBlob(canvas), width: width, height: height };
  }
  function syncStyleCards() {
    els.styleSeg.querySelectorAll("[data-style]").forEach(function (button) {
      var style = button.dataset.style;
      var preview = button.querySelector("[data-style-preview]");
      if (preview) preview.src = StickerCharacter.styleReferenceDataUrl(style);
      button.setAttribute("aria-pressed", String(style === state.style));
    });
  }

  async function builtinStyleReference(style) {
    if (builtinStyleReferenceCache[style]) return builtinStyleReferenceCache[style];
    var image = await loadImage(StickerCharacter.styleReferenceDataUrl(style));
    var canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    var normalized = {
      blob: await canvasToBlob(canvas),
      width: canvas.width,
      height: canvas.height,
      name: "style-" + style + ".png",
    };
    builtinStyleReferenceCache[style] = normalized;
    return normalized;
  }

  function releaseStyleReference() {
    if (state.styleReference.url) URL.revokeObjectURL(state.styleReference.url);
    state.styleReference = { custom: false, blob: null, url: "", name: "" };
  }

  function syncStyleReference() {
    if (state.styleReference.custom) {
      els.styleReferencePreview.src = state.styleReference.url;
      els.styleReferencePreview.hidden = false;
      els.styleReferenceName.textContent = state.styleReference.name;
      els.styleReferenceRemoveBtn.hidden = false;
      els.styleReferencePickBtn.textContent = "更換畫風參考圖";
      els.styleReferenceStatus.textContent = "已使用自訂畫風參考圖，會優先於內建畫風範例。";
      return;
    }
    els.styleReferencePreview.removeAttribute("src");
    els.styleReferencePreview.hidden = true;
    els.styleReferenceName.textContent = "";
    els.styleReferenceRemoveBtn.hidden = true;
    els.styleReferencePickBtn.textContent = "上傳畫風參考圖";
    els.styleReferenceStatus.textContent = "可上傳一張你喜歡的插畫或貼圖，AI 只參考它的線條、色彩與筆觸。";
  }

  async function setStyleReference(file) {
    try {
      var normalized = await normalizeImage(file);
      releaseStyleReference();
      state.styleReference = {
        custom: true,
        blob: normalized.blob,
        url: URL.createObjectURL(normalized.blob),
        name: file.name || "style-reference.png",
        width: normalized.width,
        height: normalized.height,
      };
      syncStyleReference();
      invalidateCharacter("styleReference");
      syncControls();
    } catch (error) {
      showError(error.message || "畫風參考圖讀取失敗。");
    }
  }

  async function requestStyleReference() {
    if (state.styleReference.custom) {
      return { name: "style-reference.png", blob: state.styleReference.blob };
    }
    var builtin = await builtinStyleReference(state.style);
    return { name: "style-reference.png", blob: builtin.blob };
  }


  function releaseReference(angle) {
    var current = state.references[angle];
    if (current && current.url) URL.revokeObjectURL(current.url);
    delete state.references[angle];
  }

  function syncReferenceCard(angle) {
    var reference = state.references[angle];
    var preview = els.referenceSlots.querySelector('[data-angle-preview="' + angle + '"]');
    var pick = els.referenceSlots.querySelector('[data-angle-pick="' + angle + '"]');
    var remove = els.referenceSlots.querySelector('[data-angle-remove="' + angle + '"]');
    var meta = els.referenceSlots.querySelector('[data-angle-meta="' + angle + '"]');
    if (reference) {
      preview.src = reference.url;
      preview.hidden = false;
      pick.hidden = true;
      remove.hidden = false;
      meta.textContent = reference.name + " · " + reference.width + "×" + reference.height;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
      pick.hidden = false;
      remove.hidden = true;
      meta.textContent = "";
    }
  }

  async function setReference(angle, file) {
    try {
      var normalized = await normalizeImage(file);
      releaseReference(angle);
      state.references[angle] = {
        name: file.name || ANGLE_NAMES[angle] + ".png",
        blob: normalized.blob,
        width: normalized.width,
        height: normalized.height,
        url: URL.createObjectURL(normalized.blob),
      };
      syncReferenceCard(angle);
      invalidateCharacter("references");
      syncControls();
    } catch (error) {
      showError(error.message || "參考圖讀取失敗。");
    }
  }

  function releaseCharacter() {
    if (state.character.url) URL.revokeObjectURL(state.character.url);
    state.character.blob = null;
    state.character.url = "";
  }

  function setCharacterBlob(blob, status, imported) {
    releaseCharacter();
    state.character.blob = blob;
    state.character.url = URL.createObjectURL(blob);
    state.character.status = status;
    state.character.imported = !!imported;
    els.characterPreviewImage.src = state.character.url;
    els.characterPreview.hidden = false;
    syncCharacterStatus();
  }

  function invalidateCharacter(field) {
    state.character.status = StickerCharacter.nextFinalizationStatus(state.character.status, field);
    syncControls();
  }

  function syncCharacterStatus() {
    var messages = {
      empty: "請先上傳主要／正面照片並產生角色定稿圖；其他角度可選填。",
      review: "定稿圖待確認。確認後才能用角色專案產生貼圖或匯出角色檔。",
      approved: "角色已確認，可用於後續批次並匯出角色檔。",
      invalidated: "角色設定或參考圖已變更，請重新產生並確認定稿圖。",
    };
    els.characterStatus.textContent = messages[state.character.status] || "";
    els.approveCharacterBtn.disabled = state.busy || state.character.status !== "review";
    els.exportCharacterBtn.disabled = state.busy || state.character.status !== "approved";
  }

  function syncWorkflow() {
    setSegment(els.workflowSeg, "workflow", state.workflow);
    var project = state.workflow === "project";
    els.characterFields.hidden = !project;
    els.workflowNote.textContent = project
      ? "主要／正面照片必填，其他角度選填。先產生並確認角色定稿圖，再用同一角色持續生成不同批次。"
      : "單次產生，不建立角色檔。主要／正面參考圖必填，其餘角度可提高同批一致性。";
    syncControls();
  }

  function syncProviderPane() {
    els.paneOpenai.classList.toggle("is-active", state.provider === "openai");
    els.paneGoogle.classList.toggle("is-active", state.provider === "google");
    setSegment(els.providerSeg, "provider", state.provider);
  }

  function syncModelCustom() {
    els.openaiModelCustom.hidden = els.openaiModel.value !== "__custom__";
    els.googleModelCustom.hidden = els.googleModel.value !== "__custom__";
  }

  function refreshPlanNote() {
    if (state.provider === "google" && els.googleModel.value === "gemini-3-pro-image-preview") {
      els.planNote.textContent = "Gemini 3 Pro Image Preview 可能需要付費方案或專案已啟用帳單；若收到 quota 或 access 錯誤，請改用 Gemini 2.5 Flash Image。";
    } else {
      els.planNote.textContent = "免費方案可使用部分 Gemini 模型；實際額度以 Google AI Studio 顯示為準。若模型未開放，API 會回傳可讀錯誤。";
    }
  }

  function renderEntries() {
    els.entries.innerHTML = "";
    state.entries.forEach(function (entry, index) {
      var row = document.createElement("div");
      row.className = "ai-entry";
      row.dataset.index = String(index);
      if (state.titleMode === "ai") {
        var title = document.createElement("textarea");
        title.className = "text-field ai-title";
        title.rows = 2;
        title.maxLength = 24;
        title.value = entry.title;
        title.placeholder = "文字，最多兩段";
        title.setAttribute("aria-label", "第 " + (index + 1) + " 張貼圖文字");
        row.appendChild(title);
      }
      var desc = document.createElement("input");
      desc.type = "text";
      desc.className = "text-field ai-desc";
      desc.value = entry.desc;
      desc.placeholder = "動作／表情說明";
      desc.setAttribute("aria-label", "第 " + (index + 1) + " 張貼圖動作說明");
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--ghost btn--sm ai-remove";
      remove.textContent = "移除";
      remove.setAttribute("aria-label", "移除第 " + (index + 1) + " 張貼圖");
      row.append(desc, remove);
      els.entries.appendChild(row);
    });
    syncControls();
  }

  function syncEntriesFromDom() {
    els.entries.querySelectorAll(".ai-entry").forEach(function (row) {
      var index = Number(row.dataset.index);
      var title = row.querySelector(".ai-title");
      state.entries[index].title = title ? title.value : state.entries[index].title;
      state.entries[index].desc = row.querySelector(".ai-desc").value;
    });
  }

  function syncControls() {
    var hasKey = !!currentKey();
    els.keyStatus.textContent = (state.provider === "openai" ? "OpenAI" : "Google") +
      (hasKey ? " API key 已設定。" : " API key 尚未設定。");
    var hasEntries = state.entries.some(function (entry) {
      if (!entry.desc.trim()) return false;
      if (state.titleMode === "none") return true;
      try { return StickerCharacter.splitCaption(entry.title).length > 0; }
      catch (error) { return false; }
    });
    var referenceSummary = StickerCharacter.referenceCompleteness(availableReferenceAngles());
    var strictReady = state.workflow !== "project" || state.character.status === "approved";
    var quickReferenceReady = state.workflow !== "quick" || referenceSummary.ready;
    var projectReferenceReady = state.workflow !== "project" || referenceSummary.ready;
    var model = selectedModel();
    var gpt2Transparent = state.provider === "openai" && model.indexOf("gpt-image-2") === 0 && state.bg === "transparent";
    els.goBtn.disabled = state.busy || !hasKey || !hasEntries || !strictReady || !quickReferenceReady || gpt2Transparent;
    els.goBtn.textContent = !hasKey ? "先填 API key" : !quickReferenceReady ? "先上傳主要／正面參考圖" : !strictReady ? "先確認角色" : gpt2Transparent ? "GPT Image 2 不支援透明背景" : state.busy ? "生成中…" : "開始生成貼圖";
    els.bulkApplyBtn.disabled = state.busy;
    els.addEntryBtn.disabled = state.busy || state.entries.length >= StickerCharacter.MAX_ENTRIES;
    els.generateCharacterBtn.disabled = state.busy || state.workflow !== "project" || !projectReferenceReady;
    els.generateCharacterBtn.textContent = !projectReferenceReady ? "先上傳主要／正面照片" : state.busy ? "產生中…" : "產生角色定稿圖";
    els.importCharacterBtn.disabled = state.busy;
    els.referenceSlots.querySelectorAll("button,input").forEach(function (control) { control.disabled = state.busy; });
    els.styleSeg.querySelectorAll("button").forEach(function (button) { button.disabled = state.busy; });
    [els.styleReferenceInput, els.styleReferencePickBtn, els.styleReferenceRemoveBtn].forEach(function (control) {
      if (control) control.disabled = state.busy;
    });
    els.providerSeg.querySelectorAll("button").forEach(function (button) { button.disabled = state.busy; });
    els.workflowSeg.querySelectorAll("button").forEach(function (button) { button.disabled = state.busy; });
    syncStyleCards();
    syncStyleReference();
    syncReferenceCompleteness(referenceSummary);
    syncCharacterStatus();
  }

  function setProgress(done, total, label) {
    els.progressStatus.textContent = done + " / " + total + (label ? " · " + label : "");
    els.progressBar.style.width = (total ? Math.round(done / total * 100) : 0) + "%";
  }

  function referenceBlobs(forCharacter, strict) {
    var plan = forCharacter
      ? ANGLES.slice()
      : StickerCharacter.referencePlan(state.workflow, !!strict);
    var list = [];
    plan.forEach(function (key) {
      if (key === "character" && state.character.status === "approved" && state.character.blob) {
        list.push({ name: "character.png", blob: state.character.blob });
      } else if (state.references[key]) {
        list.push({ name: key + ".png", blob: state.references[key].blob });
      }
    });
    return list;
  }

  async function requestReferences(forCharacter, strict) {
    var references = referenceBlobs(forCharacter, strict);
    references.push(await requestStyleReference());
    return references;
  }

  function characterIdentityPrompt() {
    var angles = availableReferenceAngles();
    var parts = [
      angles.length === 1
        ? "The input image is the primary front identity reference for this character."
        : "The input images show the same character in this labelled order: " + angles.join(", ") + ".",
      "Treat every input as identity evidence for one character, not separate people. Preserve the same face, hairstyle, body proportions, skin tone and distinguishing features.",
      "Fixed traits: " + els.fixedTraits.value.trim() + ".",
    ];
    if (els.fixedAccessories.value.trim()) parts.push("Fixed accessories: " + els.fixedAccessories.value.trim() + ".");
    if (els.defaultOutfit.value.trim()) parts.push("Default outfit: " + els.defaultOutfit.value.trim() + ".");
    return parts.join(" ");
  }
  function buildCharacterPrompt() {
    var style = StickerCharacter.STYLE_HINTS[state.style] || state.style;
    if (state.styleExtra) style += ", " + state.styleExtra;
    return characterIdentityPrompt() + " Create one polished full-body character reference image on a clean white background. Neutral standing pose, face and outfit fully visible, no text, no letters, no symbols. The final input image is the visual style reference. Use only its line quality, colors, brushwork and rendering approach; do not copy its subject, objects, text or composition. Illustration style: " + style + ". This image will be the canonical identity reference for later sticker generation.";
  }

  function buildStickerPrompt(entry, strict) {
    var prompt = [];
    var references = referenceBlobs(false, strict);
    var styleMap = {
      sticker: "LINE sticker illustration, bold clean outlines, strong readable expression, generous white sticker border",
      handdraw: "warm hand-drawn illustration, organic ink lines, visible handcrafted texture",
      chibi: "cute chibi character, large expressive head, small body, clean sticker illustration",
      watercolor: "soft watercolor illustration with clean sticker silhouette and readable expression",
      lineart: "clean expressive line art, strong silhouette, minimal shading",
      cartoon: "polished colorful cartoon illustration, bold shapes, expressive face",
    };
    if (state.workflow === "project") {
      prompt.push("The first input is the approved canonical character image. Match its identity strictly: face, hairstyle, body proportions, skin tone, fixed accessories and illustration style must remain the same.");
      if (strict && references.length > 1) prompt.push("The remaining inputs are the available labelled reference photos in this order: " + availableReferenceAngles().join(", ") + ". Use them as additional identity evidence, not as separate characters.");
      prompt.push("Fixed traits: " + els.fixedTraits.value.trim() + ".");
      if (els.fixedAccessories.value.trim()) prompt.push("Fixed accessories: " + els.fixedAccessories.value.trim() + ".");
    } else if (references.length) {
      prompt.push("Use every input image before the final style reference as evidence for the same character. Preserve identity, face, hairstyle, body proportions, skin tone, clothing and accessories consistently.");
    }
    prompt.push("The final input image is the visual style reference. Use only its line quality, colors, brushwork and rendering approach; do not copy its subject, objects, text or composition.");
    prompt.push(styleMap[state.style] || styleMap.sticker);
    if (state.styleExtra) prompt.push("Additional style direction: " + state.styleExtra + ".");
    if (els.defaultOutfit.value.trim() && state.workflow === "project") prompt.push("Default outfit: " + els.defaultOutfit.value.trim() + ".");
    prompt.push("Action and expression: " + entry.desc.trim() + ". Single complete character, centered, no cropping, no extra characters.");
    if (state.titleMode === "ai") {
      prompt.push(StickerCharacter.buildTextInstruction(entry.title, TEXT_STYLES[state.textStyle]));
    } else {
      prompt.push(StickerCharacter.buildNoTextInstruction());
    }
    if (state.bg === "transparent") prompt.push("Transparent background.");
    else if (state.bg === "chroma") prompt.push("Put the character on one perfectly flat, solid, saturated chroma green background (#00ff00), edge to edge, with no gradient, shadow or texture in the background.");
    else prompt.push("Use a clean unobtrusive background. Do not add scenery.");
    return prompt.join(" ");
  }

  async function generateRaw(prompt, references, forceOpaque) {
    var form = new FormData();
    form.append("provider", state.provider);
    form.append("api_key", currentKey());
    form.append("model", selectedModel());
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("quality", state.provider === "openai" ? els.openaiQuality.value : "medium");
    form.append("transparent", String(!forceOpaque && state.bg === "transparent"));
    references.forEach(function (reference) { form.append("reference", reference.blob, reference.name); });
    var response = await fetch(ENDPOINT, { method: "POST", body: form });
    if (!response.ok) {
      var message = "API 回傳 " + response.status;
      try { var data = await response.json(); message = data.detail || message; } catch (error) { /* response was not JSON */ }
      throw new Error(message);
    }
    return response.blob();
  }

  function fitInto(width, height, maxWidth, maxHeight, noUpscale) {
    var scale = Math.min(maxWidth / width, maxHeight / height);
    if (noUpscale) scale = Math.min(1, scale);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  async function processImage(blob, targetWidth, targetHeight, padding, forceSquare) {
    var url = URL.createObjectURL(blob);
    try {
      var image = await loadImage(url);
      var working = document.createElement("canvas");
      working.width = image.naturalWidth;
      working.height = image.naturalHeight;
      var context = working.getContext("2d");
      context.drawImage(image, 0, 0);
      if (state.bg === "chroma" && window.ChromaKey) {
        working = ChromaKey.process(working, { tolerance: Number(els.chromaSlider.value) / 100 }).canvas;
      }
      var maxWidth = targetWidth - padding * 2;
      var maxHeight = targetHeight - padding * 2;
      var fit = fitInto(working.width, working.height, maxWidth, maxHeight, padding > 0);
      var outputWidth = forceSquare ? targetWidth : StickerCharacter.evenUp(fit.width + padding * 2, targetWidth);
      var outputHeight = forceSquare ? targetHeight : StickerCharacter.evenUp(fit.height + padding * 2, targetHeight);
      var canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      var output = canvas.getContext("2d");
      var x = Math.round((outputWidth - fit.width) / 2);
      var y = Math.round((outputHeight - fit.height) / 2);
      output.drawImage(working, x, y, fit.width, fit.height);
      return { blob: await canvasToBlob(canvas), width: outputWidth, height: outputHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function generateOne(entry, index, strict) {
    var references = await requestReferences(false, strict);
    var raw = await generateRaw(
      buildStickerPrompt(entry, strict),
      references,
      false
    );
    var maxWidth = state.size === "square" ? SQUARE : ST_MAX_W;
    var maxHeight = state.size === "square" ? SQUARE : ST_MAX_H;
    var processed = await processImage(raw, maxWidth, maxHeight, state.pad, state.size === "square");
    var main = await processImage(raw, MAIN, MAIN, Math.min(state.pad, 20), true);
    var tab = await processImage(raw, TAB_W, TAB_H, Math.min(state.pad, 8), true);
    return { index: index, title: entry.title, desc: entry.desc, raw: raw, blob: processed.blob, width: processed.width, height: processed.height, main: main.blob, tab: tab.blob };
  }

  function renderOutputs() {
    els.grid.innerHTML = "";
    state.outputs.forEach(function (output, index) {
      if (output.url) URL.revokeObjectURL(output.url);
      var url = URL.createObjectURL(output.blob);
      output.url = url;
      var card = document.createElement("div");
      card.className = "ai-card";

      var imageWrap = document.createElement("div");
      imageWrap.className = "ai-card__img-wrap";
      var image = document.createElement("img");
      image.src = url;
      image.alt = output.title || output.desc || "貼圖";
      imageWrap.appendChild(image);

      var info = document.createElement("div");
      info.className = "ai-card__info";
      var title = document.createElement("span");
      title.className = "ai-card__title";
      title.textContent = output.title || output.desc || "無文字貼圖";
      var size = document.createElement("span");
      size.className = "ai-card__size";
      size.textContent = output.width + "×" + output.height;
      info.append(title, size);

      var actions = document.createElement("div");
      actions.className = "ai-card__actions";
      var downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "btn btn--secondary btn--sm ai-download";
      downloadButton.dataset.i = String(index);
      downloadButton.textContent = "下載 PNG";
      var regenerateButton = document.createElement("button");
      regenerateButton.type = "button";
      regenerateButton.className = "btn btn--ghost btn--sm ai-regen";
      regenerateButton.dataset.i = String(index);
      regenerateButton.textContent = "重新生成";
      actions.append(downloadButton, regenerateButton);
      if (state.workflow === "project") {
        var strictButton = document.createElement("button");
        strictButton.type = "button";
        strictButton.className = "btn btn--ghost btn--sm ai-regen-strict";
        strictButton.dataset.i = String(index);
        strictButton.title = "額外附上目前已有的原始角度參考圖，圖片輸入成本較高";
        strictButton.textContent = "嚴格參考重生";
        actions.appendChild(strictButton);
      }
      card.append(imageWrap, info, actions);
      els.grid.appendChild(card);
    });
    els.emptyState.hidden = !!state.outputs.length;
    els.resultPanel.hidden = !state.outputs.length;
    els.zipBtn.disabled = !state.outputs.length;
    els.clearBtn.disabled = !state.outputs.length;
  }

  function clearOutputUrls() {
    state.outputs.forEach(function (output) {
      if (output.url) URL.revokeObjectURL(output.url);
      output.url = "";
    });
  }

  async function generateAll() {
    if (state.busy) return;
    if (state.entries.length > StickerCharacter.MAX_ENTRIES) {
      showError("一批最多只能生成 " + StickerCharacter.MAX_ENTRIES + " 張貼圖。");
      return;
    }
    syncEntriesFromDom();
    var entries = [];
    for (var i = 0; i < state.entries.length; i += 1) {
      var entry = state.entries[i];
      if (!entry.desc.trim()) continue;
      if (state.titleMode === "ai") {
        try {
          if (!StickerCharacter.splitCaption(entry.title).length) continue;
        } catch (error) {
          showError("第 " + (i + 1) + " 張貼圖文字最多只能有兩段。");
          return;
        }
      }
      entries.push({ entry: entry, sourceIndex: i });
    }
    if (!entries.length) { showError("請至少加入一筆完整貼圖內容。"); return; }
    if (!currentKey()) { showError("請先填入 " + (state.provider === "openai" ? "OpenAI" : "Google") + " 的 API key。"); return; }
    if (state.workflow === "quick" && !state.references.front) { showError("快速模式至少需要主要／正面參考圖。"); return; }
    if (state.workflow === "project" && state.character.status !== "approved") { showError("請先產生並確認角色定稿圖。"); return; }
    if (state.provider === "openai" && selectedModel().indexOf("gpt-image-2") === 0 && state.bg === "transparent") { showError("gpt-image-2 不支援透明背景。請改用綠幕去背或不處理。"); return; }
    state.busy = true;
    hideMessages();
    els.progress.classList.add("is-shown");
    setProgress(0, entries.length, "準備中");
    syncControls();
    var items = [];
    var failures = [];
    for (var index = 0; index < entries.length; index += 1) {
      setProgress(index, entries.length, "生成第 " + (index + 1) + " 張");
      try { items.push(await generateOne(entries[index].entry, entries[index].sourceIndex)); }
      catch (error) { failures.push("第 " + (index + 1) + " 張：" + error.message); }
    }
    clearOutputUrls();
    state.outputs = items;
    renderOutputs();
    setProgress(entries.length, entries.length, failures.length ? "部分完成" : "完成");
    state.busy = false;
    syncControls();
    if (failures.length) showError(failures.join("；") + "。系統不會自動重試；手動重試可能再次計費。");
    else showSuccess("已生成 " + items.length + " 張貼圖。可逐張下載或打包 ZIP。");
    window.setTimeout(function () { els.progress.classList.remove("is-shown"); }, 900);
  }

  async function regenerate(index, strict) {
    if (state.busy || !state.outputs[index]) return;
    if (!window.confirm("重新生成會再次呼叫付費圖片 API，可能再次計費。是否繼續？")) return;
    syncEntriesFromDom();
    var entry = state.entries[state.outputs[index].index];
    state.busy = true;
    hideMessages();
    els.progress.classList.add("is-shown");
    setProgress(0, 1, strict ? "嚴格參考重新生成" : "重新生成");
    syncControls();
    try {
      var replacement = await generateOne(entry, state.outputs[index].index, !!strict);
      if (state.outputs[index].url) URL.revokeObjectURL(state.outputs[index].url);
      state.outputs[index] = replacement;
      renderOutputs();
      showSuccess("第 " + (index + 1) + " 張已重新生成。" + (strict ? "本次已附上 " + availableReferenceAngles().length + " 張角度參考圖。" : ""));
    } catch (error) {
      showError(error.message);
    } finally {
      state.busy = false;
      els.progress.classList.remove("is-shown");
      syncControls();
    }
  }

  async function generateCharacter() {
    if (state.busy) return;
    if (!currentKey()) { showError("請先填入所選 AI 服務的 API key。"); return; }
    if (!state.references.front) { showError("角色專案至少需要主要／正面參考圖。"); return; }
    if (!els.fixedTraits.value.trim()) { showError("請填寫固定角色特徵。"); els.fixedTraits.focus(); return; }
    if (state.character.blob && !window.confirm("重新產生角色定稿圖會再次呼叫付費圖片 API，可能再次計費。是否繼續？")) return;
    if (state.character.blob) state.character.status = "invalidated";
    state.busy = true;
    hideMessages();
    els.progress.classList.add("is-shown");
    setProgress(0, 1, "產生角色定稿圖");
    syncControls();
    try {
      var blob = await generateRaw(buildCharacterPrompt(), await requestReferences(true, false), true);
      setCharacterBlob(blob, "review", false);
      setProgress(1, 1, "待確認");
      showSuccess("角色定稿圖已產生。本次使用 " + availableReferenceAngles().length + " 張參考圖，請確認角色外觀後按「確認角色」。");
    } catch (error) {
      showError((error.message || "角色定稿圖生成失敗。") + " 系統不會自動重試；手動重試可能再次計費。");
    } finally {
      state.busy = false;
      els.progress.classList.remove("is-shown");
      syncControls();
    }
  }

  function approveCharacter() {
    if (state.character.status !== "review" || !state.character.blob) return;
    state.character.status = "approved";
    syncControls();
    showSuccess("角色已確認。一般批次會使用這張定稿圖；角色漂移時可針對單張使用嚴格參考重生。");
  }

  function currentProject() {
    return {
      provider: state.provider,
      model: selectedModel(),
      promptVersion: state.promptVersion,
      style: state.style,
      styleExtra: state.styleExtra,
      customStyleReference: state.styleReference.custom,
      fixedTraits: els.fixedTraits.value,
      fixedAccessories: els.fixedAccessories.value,
      defaultOutfit: els.defaultOutfit.value,
      referenceAngles: availableReferenceAngles(),
    };
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function exportCharacter() {
    if (state.character.status !== "approved" || !state.character.blob) { showError("請先確認角色定稿圖。"); return; }
    if (!window.JSZip) { showError("ZIP 元件尚未載入，請重新整理後再試。"); return; }
    try {
      var manifest = StickerCharacter.createManifest(currentProject());
      StickerCharacter.validateManifest(manifest);
      var styleReference = state.styleReference.custom ? await requestStyleReference() : null;
      var zip = new JSZip();
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      zip.file("character.png", state.character.blob);
      ANGLES.forEach(function (angle) {
        if (state.references[angle]) zip.file(StickerCharacter.REFERENCE_PATHS[angle], state.references[angle].blob);
      });
      if (styleReference) zip.file(manifest.style_reference, styleReference.blob);
      var archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      downloadBlob(archive, safeName(els.characterName.value) + ".hd-character.zip");
      showSuccess("角色檔已下載。檔案包含原始參考內容，請妥善保管。");
    } catch (error) {
      showError(error.message || "角色檔匯出失敗。");
    }
  }

  async function decodeArchiveImage(bytes, path) {
    var file = new File([bytes], path.split("/").pop(), { type: "image/png" });
    return normalizeImage(file);
  }

  async function importCharacter(file) {
    if (!file) return;
    if (!window.JSZip) { showError("ZIP 元件尚未載入，請重新整理後再試。"); return; }
    if (file.size > StickerCharacter.ARCHIVE_LIMITS.compressedBytes) { showError("角色檔不可超過 40 MB。"); return; }
    state.busy = true;
    hideMessages();
    syncControls();
    try {
      var zip = await JSZip.loadAsync(file);
      var actualFiles = Object.keys(zip.files).filter(function (name) { return !zip.files[name].dir; }).sort();
      var declaredSizes = {};
      actualFiles.forEach(function (name) {
        var metadata = zip.files[name]._data;
        declaredSizes[name] = metadata && Number.isFinite(metadata.uncompressedSize)
          ? metadata.uncompressedSize
          : 0;
      });
      StickerCharacter.validateArchiveMetadata(declaredSizes, file.size);

      var archiveBytes = {};
      var actualSizes = {};
      for (var fileIndex = 0; fileIndex < actualFiles.length; fileIndex += 1) {
        var path = actualFiles[fileIndex];
        archiveBytes[path] = await zip.file(path).async("uint8array");
        actualSizes[path] = archiveBytes[path].byteLength;
        StickerCharacter.validateArchiveMetadata(
          Object.assign({}, declaredSizes, actualSizes),
          file.size
        );
      }
      StickerCharacter.validateArchiveMetadata(actualSizes, file.size);
      var manifestText;
      try { manifestText = new TextDecoder("utf-8", { fatal: true }).decode(archiveBytes["manifest.json"]); }
      catch (error) { throw new Error("manifest.json 不是有效 UTF-8。"); }
      var manifest;
      try { manifest = JSON.parse(manifestText); } catch (error) { throw new Error("manifest.json 不是有效 JSON。"); }
      StickerCharacter.validateManifest(manifest);
      StickerCharacter.validateArchiveMetadata(actualSizes, file.size, manifest);
      var decodedReferences = {};
      var referenceAngles = Object.keys(manifest.references);
      for (var i = 0; i < referenceAngles.length; i += 1) {
        var angle = referenceAngles[i];
        decodedReferences[angle] = await decodeArchiveImage(archiveBytes[manifest.references[angle]], manifest.references[angle]);
      }
      var decodedStyleReference = manifest.style_reference
        ? await decodeArchiveImage(archiveBytes[manifest.style_reference], manifest.style_reference)
        : null;
      var decodedCharacter = await decodeArchiveImage(archiveBytes[manifest.character_image], manifest.character_image);
      ANGLES.forEach(function (angle) {
        releaseReference(angle);
        var decoded = decodedReferences[angle];
        if (decoded) {
          state.references[angle] = { name: angle + ".png", blob: decoded.blob, width: decoded.width, height: decoded.height, url: URL.createObjectURL(decoded.blob) };
        }
        syncReferenceCard(angle);
      });
      releaseStyleReference();
      if (decodedStyleReference) {
        state.styleReference = {
          custom: true,
          blob: decodedStyleReference.blob,
          width: decodedStyleReference.width,
          height: decodedStyleReference.height,
          name: "style-reference.png",
          url: URL.createObjectURL(decodedStyleReference.blob),
        };
      }
      state.workflow = "project";
      state.provider = manifest.provider;
      state.style = manifest.style;
      state.styleExtra = manifest.style_extra || "";
      state.promptVersion = manifest.prompt_version;
      els.styleExtra.value = state.styleExtra;
      els.fixedTraits.value = manifest.fixed_traits;
      els.fixedAccessories.value = manifest.fixed_accessories || "";
      els.defaultOutfit.value = manifest.default_outfit || "";
      els.characterName.value = file.name.replace(/\.hd-character\.zip$/i, "").replace(/\.zip$/i, "");
      if (manifest.provider === "openai") {
        var openaiOption = Array.from(els.openaiModel.options).some(function (option) { return option.value === manifest.model; });
        els.openaiModel.value = openaiOption ? manifest.model : "__custom__";
        els.openaiModelCustom.value = openaiOption ? "" : manifest.model;
      } else {
        var googleOption = Array.from(els.googleModel.options).some(function (option) { return option.value === manifest.model; });
        els.googleModel.value = googleOption ? manifest.model : "__custom__";
        els.googleModelCustom.value = googleOption ? "" : manifest.model;
      }
      setSegment(els.styleSeg, "style", state.style);
      setCharacterBlob(decodedCharacter.blob, "approved", true);
      syncWorkflow();
      syncProviderPane();
      syncModelCustom();
      refreshPlanNote();
      showSuccess(
        "角色檔已匯入並通過驗證，可直接開始新的貼圖批次。提示詞版本：" +
        state.promptVersion +
        "。"
      );
    } catch (error) {
      showError(error.message || "角色檔匯入失敗。");
    } finally {
      state.busy = false;
      els.importCharacterInput.value = "";
      syncControls();
    }
  }

  function applyBulk() {
    var parsed = StickerCharacter.parseBulkEntries(els.bulkEntries.value, state.titleMode);
    if (parsed.invalidLines.length) {
      showError("批次貼上格式錯誤，請檢查第 " + parsed.invalidLines.join("、") + " 行。本次未套用任何變更。");
      return;
    }
    if (parsed.overLimit) {
      showError("一批最多只能加入 " + StickerCharacter.MAX_ENTRIES + " 張貼圖。本次未套用任何變更。");
      return;
    }
    if (!parsed.entries.length) { showError("批次貼上內容是空的。"); return; }
    state.entries = parsed.entries;
    renderEntries();
    hideMessages();
  }

  async function downloadZip() {
    if (!state.outputs.length || !window.JSZip) return;
    var zip = new JSZip();
    state.outputs.forEach(function (output, index) {
      var number = String(index + 1).padStart(2, "0");
      zip.file(number + ".png", output.blob);
      if (index === 0) {
        zip.file("main.png", output.main);
        zip.file("tab.png", output.tab);
      }
    });
    downloadBlob(await zip.generateAsync({ type: "blob" }), "line-stickers.zip");
  }

  els.workflowSeg.addEventListener("click", function (event) {
    var button = event.target.closest("[data-workflow]");
    if (!button || state.busy) return;
    state.workflow = button.dataset.workflow;
    syncWorkflow();
  });

  els.referenceSlots.addEventListener("click", function (event) {
    var pick = event.target.closest("[data-angle-pick]");
    var remove = event.target.closest("[data-angle-remove]");
    if (pick) els.referenceSlots.querySelector('[data-angle-input="' + pick.dataset.anglePick + '"]').click();
    if (remove) {
      releaseReference(remove.dataset.angleRemove);
      syncReferenceCard(remove.dataset.angleRemove);
      invalidateCharacter("references");
      syncControls();
    }
  });
  els.referenceSlots.querySelectorAll("[data-angle-input]").forEach(function (input) {
    input.addEventListener("change", function () { if (input.files[0]) setReference(input.dataset.angleInput, input.files[0]); input.value = ""; });
  });

  els.entries.addEventListener("input", function () { syncEntriesFromDom(); syncControls(); });
  els.entries.addEventListener("click", function (event) {
    var button = event.target.closest(".ai-remove");
    if (!button || state.busy) return;
    syncEntriesFromDom();
    var index = Number(button.closest(".ai-entry").dataset.index);
    state.entries.splice(index, 1);
    if (!state.entries.length) state.entries.push({ title: "", desc: "" });
    renderEntries();
  });
  els.addEntryBtn.addEventListener("click", function () {
    syncEntriesFromDom();
    if (state.entries.length >= StickerCharacter.MAX_ENTRIES) {
      showError("一批最多只能加入 " + StickerCharacter.MAX_ENTRIES + " 張貼圖。");
      syncControls();
      return;
    }
    state.entries.push({ title: "", desc: "" });
    renderEntries();
  });
  els.bulkApplyBtn.addEventListener("click", applyBulk);

  els.styleSeg.addEventListener("click", function (event) {
    var button = event.target.closest("[data-style]");
    if (!button || state.busy) return;
    state.style = button.dataset.style;
    syncStyleCards();
    invalidateCharacter("style");
  });
  els.styleExtra.addEventListener("input", function () { state.styleExtra = els.styleExtra.value.trim(); invalidateCharacter("style"); });
  els.styleReferencePickBtn.addEventListener("click", function () { if (!state.busy) els.styleReferenceInput.click(); });
  els.styleReferenceInput.addEventListener("change", function () {
    if (els.styleReferenceInput.files[0]) setStyleReference(els.styleReferenceInput.files[0]);
    els.styleReferenceInput.value = "";
  });
  els.styleReferenceRemoveBtn.addEventListener("click", function () {
    if (state.busy) return;
    releaseStyleReference();
    syncStyleReference();
    invalidateCharacter("styleReference");
    syncControls();
  });

  els.titleSeg.addEventListener("click", function (event) {
    var button = event.target.closest("[data-title]");
    if (!button) return;
    syncEntriesFromDom();
    state.titleMode = button.dataset.title;
    setSegment(els.titleSeg, "title", state.titleMode);
    els.textStyleRow.hidden = state.titleMode !== "ai";
    renderEntries();
  });
  els.textStyleSeg.addEventListener("click", function (event) {
    var button = event.target.closest("[data-text-style]");
    if (!button) return;
    state.textStyle = button.dataset.textStyle;
    setSegment(els.textStyleSeg, "textStyle", state.textStyle);
  });

  els.providerSeg.addEventListener("click", function (event) {
    var button = event.target.closest("[data-provider]");
    if (!button || state.busy) return;
    state.provider = button.dataset.provider;
    syncProviderPane();
    invalidateCharacter("provider");
    syncControls();
  });
  [els.openaiModel, els.googleModel].forEach(function (select) {
    select.addEventListener("change", function () { syncModelCustom(); refreshPlanNote(); invalidateCharacter("model"); syncControls(); });
  });
  [els.openaiModelCustom, els.googleModelCustom].forEach(function (input) {
    input.addEventListener("input", function () { invalidateCharacter("model"); syncControls(); });
  });
  els.openaiQuality.addEventListener("change", syncControls);

  els.bgSeg.addEventListener("click", function (event) {
    var button = event.target.closest("[data-bg]");
    if (!button) return;
    state.bg = button.dataset.bg;
    setSegment(els.bgSeg, "bg", state.bg);
    els.chromaRow.style.opacity = state.bg === "chroma" ? "1" : ".45";
    els.chromaRow.style.pointerEvents = state.bg === "chroma" ? "auto" : "none";
    syncControls();
  });
  els.chromaSlider.addEventListener("input", function () { els.chromaVal.textContent = els.chromaSlider.value; });
  els.fitSeg.addEventListener("click", function (event) {
    var button = event.target.closest("[data-fit]");
    if (!button) return;
    state.size = button.dataset.fit;
    setSegment(els.fitSeg, "fit", state.size);
  });
  els.padSlider.addEventListener("input", function () {
    state.pad = Number(els.padSlider.value);
    els.padVal.textContent = String(state.pad);
  });

  [els.fixedTraits, els.fixedAccessories].forEach(function (input) { input.addEventListener("input", function () { invalidateCharacter(input.id); }); });
  els.generateCharacterBtn.addEventListener("click", generateCharacter);
  els.approveCharacterBtn.addEventListener("click", approveCharacter);
  els.exportCharacterBtn.addEventListener("click", exportCharacter);
  els.importCharacterBtn.addEventListener("click", function () { els.importCharacterInput.click(); });
  els.importCharacterInput.addEventListener("change", function () { importCharacter(els.importCharacterInput.files[0]); });
  els.openSettingsBtn.addEventListener("click", function () {
    if (window.Settings) Settings.openPanel();
  });

  els.goBtn.addEventListener("click", generateAll);
  els.zipBtn.addEventListener("click", downloadZip);
  els.clearBtn.addEventListener("click", function () { clearOutputUrls(); state.outputs = []; renderOutputs(); hideMessages(); });
  els.grid.addEventListener("click", function (event) {
    var download = event.target.closest(".ai-download");
    var regen = event.target.closest(".ai-regen");
    var strictRegen = event.target.closest(".ai-regen-strict");
    if (download) downloadBlob(state.outputs[Number(download.dataset.i)].blob, String(Number(download.dataset.i) + 1).padStart(2, "0") + ".png");
    if (regen) regenerate(Number(regen.dataset.i), false);
    if (strictRegen) regenerate(Number(strictRegen.dataset.i), true);
  });

  if (window.Settings) Settings.onChange(syncControls);
  window.addEventListener("beforeunload", function () {
    ANGLES.forEach(releaseReference);
    releaseStyleReference();
    releaseCharacter();
    clearOutputUrls();
  });

  renderEntries();
  syncWorkflow();
  syncProviderPane();
  syncModelCustom();
  refreshPlanNote();
  syncCharacterStatus();
  syncControls();
})();
