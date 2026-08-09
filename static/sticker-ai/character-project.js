(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StickerCharacter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCHEMA_VERSION = 1;
  var CURRENT_PROMPT_VERSION = "1.0.0";
  var MAX_CAPTION_SEGMENTS = 2;
  var MAX_ENTRIES = 40;
  var PROVIDERS = ["openai", "google"];
  var STYLES = ["sticker", "handdraw", "chibi", "watercolor", "lineart", "cartoon"];
  var STYLE_LABELS = {
    sticker: "貼圖白邊",
    handdraw: "手繪",
    chibi: "Q 版",
    watercolor: "水彩",
    lineart: "線稿",
    cartoon: "卡通",
  };
  var STYLE_HINTS = {
    sticker: "粗線條、白色外框",
    handdraw: "有手感的自然筆觸",
    chibi: "大頭、小身體",
    watercolor: "柔和暈染、透明色彩",
    lineart: "簡潔線條、少量上色",
    cartoon: "明亮色彩、俐落造型",
  };
  var STYLE_REFERENCE_PATH = "references/style.png";
  var STYLE_REFERENCE_ASSETS = {
    sticker: "/static/sticker-ai/style-references/sticker.png",
    handdraw: "/static/sticker-ai/style-references/handdraw.png",
    chibi: "/static/sticker-ai/style-references/chibi.png",
    watercolor: "/static/sticker-ai/style-references/watercolor.png",
    lineart: "/static/sticker-ai/style-references/lineart.png",
    cartoon: "/static/sticker-ai/style-references/cartoon.png",
  };

  function styleReferenceDataUrl(style) {
    if (STYLES.indexOf(style) < 0) throw new Error("不支援的插畫風格。");
    return STYLE_REFERENCE_ASSETS[style];
  }

  var REFERENCE_PATHS = {
    front: "references/front.png",
    top: "references/top.png",
    bottom: "references/bottom.png",
    left: "references/left.png",
    right: "references/right.png",
    extra1: "references/extra1.png",
    extra2: "references/extra2.png",
    extra3: "references/extra3.png",
    extra4: "references/extra4.png",
    extra5: "references/extra5.png",
  };
  var ARCHIVE_ENTRIES = [
    "manifest.json",
    "character.png",
  ].concat(Object.keys(REFERENCE_PATHS).map(function (angle) { return REFERENCE_PATHS[angle]; })).concat(STYLE_REFERENCE_PATH);
  var IDENTITY_FIELDS = ["references", "fixedTraits", "fixedAccessories", "style", "styleReference"];
  var ARCHIVE_LIMITS = {
    compressedBytes: 40 * 1024 * 1024,
    uncompressedBytes: 50 * 1024 * 1024,
    manifestBytes: 256 * 1024,
  };

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function requiredText(value, label) {
    var text = String(value == null ? "" : value).trim();
    if (!text) throw new Error(label + "不可空白。");
    return text;
  }

  function splitCaption(raw) {
    var segments = String(raw == null ? "" : raw)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
    if (segments.length > MAX_CAPTION_SEGMENTS) {
      throw new Error("貼圖文字最多兩段。");
    }
    return segments;
  }

  function buildTextInstruction(raw, styleDescription) {
    var segments = splitCaption(raw);
    if (!segments.length) throw new Error("貼圖文字不可空白。");
    return "Render exactly this Traditional Chinese sticker text with no substitutions: " +
      JSON.stringify(segments) + ". Use " + requiredText(styleDescription, "文字風格") +
      ". Keep every segment fully visible and highly legible. Choose the best composition-dependent placement, including above, below, left, right, speech bubble or other clear negative space. Never cover the face or important action.";
  }

  function buildNoTextInstruction() {
    return "Do not render any text, letters, numbers, captions, logos, watermarks or symbols.";
  }

  function parseBulkEntries(raw, mode) {
    if (mode !== "ai" && mode !== "none") {
      throw new Error("未知的文字模式。");
    }
    var entries = [];
    var invalidLines = [];
    String(raw == null ? "" : raw).split(/\r?\n/).forEach(function (rawLine, index) {
      var line = rawLine.trim();
      if (!line) return;
      if (mode === "none") {
        entries.push({ title: "", desc: line });
        return;
      }

      var separator = line.indexOf("|");
      if (separator < 0) {
        invalidLines.push(index + 1);
        return;
      }
      var title = line.slice(0, separator).trim().replace(/\\n/g, "\n");
      var desc = line.slice(separator + 1).trim();
      try {
        var segments = splitCaption(title);
        if (!segments.length || !desc) throw new Error("欄位空白");
        entries.push({ title: segments.join("\n"), desc: desc });
      } catch (error) {
        invalidLines.push(index + 1);
      }
    });
    return {
      entries: entries,
      invalidLines: invalidLines,
      overLimit: entries.length > MAX_ENTRIES,
    };
  }

  function evenUp(value, maximum) {
    var even = value + value % 2;
    return Math.min(maximum, even);
  }


  function nextFinalizationStatus(currentStatus, changedField) {
    if (IDENTITY_FIELDS.indexOf(changedField) < 0) return currentStatus;
    if (currentStatus === "approved" || currentStatus === "review") return "invalidated";
    return currentStatus;
  }

  function referencePlan(workflow, strict) {
    var angles = Object.keys(REFERENCE_PATHS);
    if (workflow === "quick") return angles;
    if (workflow === "project") {
      return strict ? ["character"].concat(angles) : ["character"];
    }
    throw new Error("未知的使用方式。");
  }

  function normalizeReferenceAngles(value) {
    var seen = {};
    if (!Array.isArray(value)) return [];
    return value.filter(function (angle) {
      if (!REFERENCE_PATHS[angle] || seen[angle]) return false;
      seen[angle] = true;
      return true;
    });
  }

  function referenceCompleteness(referenceAngles) {
    var angles = normalizeReferenceAngles(referenceAngles);
    var ready = angles.indexOf("front") >= 0;
    if (!ready) {
      return { count: angles.length, ready: false, level: "missing", label: "請先上傳主要／正面照片" };
    }
    if (angles.length === 1) {
      return { count: 1, ready: true, level: "base", label: "基礎一致性" };
    }
    if (angles.length === Object.keys(REFERENCE_PATHS).length) {
      return { count: angles.length, ready: true, level: "best", label: "最佳一致性" };
    }
    return { count: angles.length, ready: true, level: "better", label: "較佳一致性" };
  }
  function validateArchiveMetadata(fileSizes, compressedBytes, manifest) {
    if (!Number.isFinite(compressedBytes) || compressedBytes < 0 || compressedBytes > ARCHIVE_LIMITS.compressedBytes) {
      throw new Error("角色檔不可超過 40 MB。");
    }
    if (!isPlainObject(fileSizes)) throw new Error("角色檔內容格式錯誤。");
    var actual = Object.keys(fileSizes).sort();
    var allowed = ARCHIVE_ENTRIES.slice().sort();
    if (actual.some(function (name) { return allowed.indexOf(name) < 0; })) {
      throw new Error("角色檔包含不支援的檔案。");
    }
    if (actual.indexOf("manifest.json") < 0 || actual.indexOf("character.png") < 0) {
      throw new Error("角色檔內容不完整。");
    }
    if (actual.indexOf(REFERENCE_PATHS.front) < 0) {
      throw new Error("角色檔缺少主要／正面參考圖。");
    }
    if (manifest) {
      validateManifest(manifest);
      var expected = ["manifest.json", manifest.character_image]
        .concat(Object.keys(manifest.references).map(function (angle) { return manifest.references[angle]; }));
      if (manifest.style_reference) expected.push(manifest.style_reference);
      expected.sort();
      if (actual.length !== expected.length || actual.some(function (name, index) { return name !== expected[index]; })) {
        throw new Error("角色檔內容與 manifest 不一致。");
      }
    }
    var total = 0;
    actual.forEach(function (name) {
      var size = fileSizes[name];
      if (!Number.isFinite(size) || size < 0) throw new Error("角色檔內容大小無效。");
      total += size;
    });
    if (fileSizes["manifest.json"] > ARCHIVE_LIMITS.manifestBytes) {
      throw new Error("角色檔 manifest.json 不可超過 256 KB。");
    }
    if (total > ARCHIVE_LIMITS.uncompressedBytes) {
      throw new Error("角色檔解壓後總大小不可超過 50 MB。");
    }
    return true;
  }

  function createManifest(project) {
    project = project || {};
    var references = {};
    normalizeReferenceAngles(project.referenceAngles).forEach(function (angle) {
      references[angle] = REFERENCE_PATHS[angle];
    });
    var manifest = {
      schema_version: SCHEMA_VERSION,
      provider: String(project.provider == null ? "" : project.provider).trim(),
      model: String(project.model == null ? "" : project.model).trim(),
      prompt_version: String(project.promptVersion == null ? "" : project.promptVersion).trim(),
      style: String(project.style == null ? "" : project.style).trim(),
      style_extra: String(project.styleExtra == null ? "" : project.styleExtra).trim(),
      fixed_traits: String(project.fixedTraits == null ? "" : project.fixedTraits).trim(),
      fixed_accessories: String(project.fixedAccessories == null ? "" : project.fixedAccessories).trim(),
      default_outfit: String(project.defaultOutfit == null ? "" : project.defaultOutfit).trim(),
      references: references,
      character_image: "character.png",
    };
    if (project.customStyleReference) manifest.style_reference = STYLE_REFERENCE_PATH;
    return manifest;
  }

  function validateManifest(manifest) {
    if (!isPlainObject(manifest)) throw new Error("角色檔 manifest 格式錯誤。");
    if (manifest.schema_version !== SCHEMA_VERSION) {
      throw new Error("不支援的角色檔版本。");
    }
    if (PROVIDERS.indexOf(manifest.provider) < 0) {
      throw new Error("角色檔的 AI 供應商不受支援。");
    }
    requiredText(manifest.model, "模型 ID");
    requiredText(manifest.prompt_version, "提示詞版本");
    if (manifest.prompt_version !== CURRENT_PROMPT_VERSION) {
      throw new Error("不支援的提示詞版本：" + manifest.prompt_version + "。");
    }
    if (STYLES.indexOf(manifest.style) < 0) {
      throw new Error("角色檔的插畫風格不受支援。");
    }
    requiredText(manifest.fixed_traits, "固定角色特徵");
    if (manifest.character_image !== "character.png") {
      throw new Error("角色檔缺少角色定稿圖。");
    }
    if (!isPlainObject(manifest.references)) {
      throw new Error("角色檔缺少主要／正面參考圖。");
    }
    var keys = Object.keys(manifest.references);
    if (manifest.references.front !== REFERENCE_PATHS.front) {
      throw new Error("角色檔缺少主要／正面參考圖。");
    }
    if (keys.some(function (key) {
      return !REFERENCE_PATHS[key] || manifest.references[key] !== REFERENCE_PATHS[key];
    })) {
      throw new Error("角色檔包含不支援的參考圖。");
    }
    if (manifest.style_reference != null && manifest.style_reference !== STYLE_REFERENCE_PATH) {
      throw new Error("角色檔包含不支援的畫風參考圖。");
    }
    return manifest;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    CURRENT_PROMPT_VERSION: CURRENT_PROMPT_VERSION,
    MAX_CAPTION_SEGMENTS: MAX_CAPTION_SEGMENTS,
    MAX_ENTRIES: MAX_ENTRIES,
    PROVIDERS: PROVIDERS.slice(),
    REFERENCE_PATHS: Object.assign({}, REFERENCE_PATHS),
    STYLE_REFERENCE_PATH: STYLE_REFERENCE_PATH,
    STYLE_LABELS: Object.assign({}, STYLE_LABELS),
    STYLE_HINTS: Object.assign({}, STYLE_HINTS),
    STYLES: STYLES.slice(),
    ARCHIVE_ENTRIES: ARCHIVE_ENTRIES.slice(),
    ARCHIVE_LIMITS: Object.assign({}, ARCHIVE_LIMITS),
    IDENTITY_FIELDS: IDENTITY_FIELDS.slice(),
    splitCaption: splitCaption,
    buildTextInstruction: buildTextInstruction,
    buildNoTextInstruction: buildNoTextInstruction,
    parseBulkEntries: parseBulkEntries,
    evenUp: evenUp,
    nextFinalizationStatus: nextFinalizationStatus,
    referencePlan: referencePlan,
    referenceCompleteness: referenceCompleteness,
    styleReferenceDataUrl: styleReferenceDataUrl,
    createManifest: createManifest,
    validateManifest: validateManifest,
    validateArchiveMetadata: validateArchiveMetadata,
  };
});
