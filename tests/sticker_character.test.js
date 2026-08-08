const test = require("node:test");
const assert = require("node:assert/strict");

const Character = require("../static/sticker-ai/character-project.js");

function validProject(overrides) {
  return Object.assign({
    provider: "openai",
    model: "gpt-image-2",
    promptVersion: "1.0.0",
    style: "sticker",
    styleExtra: "暖色調",
    fixedTraits: "圓臉、黑色短髮、紅框眼鏡",
    fixedAccessories: "紅框眼鏡",
    defaultOutfit: "米白色帽 T",
    referenceAngles: ["front", "top", "bottom", "left", "right"],
  }, overrides || {});
}

test("splitCaption accepts one or two non-empty segments", () => {
  assert.deepEqual(Character.splitCaption("辛苦了\n你最棒"), ["辛苦了", "你最棒"]);
  assert.deepEqual(Character.splitCaption("  謝謝  \n\n"), ["謝謝"]);
});

test("splitCaption rejects more than two segments", () => {
  assert.throws(() => Character.splitCaption("一\n二\n三"), /最多兩段/);
});

test("bulk text mode decodes a literal newline marker", () => {
  assert.deepEqual(
    Character.parseBulkEntries("辛苦了\\n你最棒|雙手比讚", "ai").entries[0],
    { title: "辛苦了\n你最棒", desc: "雙手比讚" }
  );
});

test("AI text instruction preserves both caption segments and free placement", () => {
  const instruction = Character.buildTextInstruction(
    "辛苦了\n你最棒",
    "可愛圓體字"
  );

  assert.match(instruction, /辛苦了/);
  assert.match(instruction, /你最棒/);
  assert.match(instruction, /above, below, left, right, speech bubble/);
  assert.match(instruction, /可愛圓體字/);
});

test("no-text instruction explicitly forbids rendered characters", () => {
  assert.match(Character.buildNoTextInstruction(), /Do not render any text/);
});

test("bulk text mode rejects malformed rows atomically", () => {
  const parsed = Character.parseBulkEntries("嗨|揮手\n沒有分隔符", "ai");

  assert.deepEqual(parsed.invalidLines, [2]);
  assert.deepEqual(parsed.entries, [{ title: "嗨", desc: "揮手" }]);
});

test("no-text bulk mode treats each line as an action", () => {
  assert.deepEqual(
    Character.parseBulkEntries("揮手\n比讚", "none").entries,
    [{ title: "", desc: "揮手" }, { title: "", desc: "比讚" }]
  );
});

test("bulk mode reports more than 40 entries without truncating", () => {
  const rows = Array.from({ length: 41 }, (_, index) => `動作 ${index + 1}`).join("\n");
  const parsed = Character.parseBulkEntries(rows, "none");

  assert.equal(parsed.entries.length, 41);
  assert.equal(parsed.overLimit, true);
});

test("evenUp preserves LINE maximum dimensions", () => {
  assert.equal(Character.evenUp(283, 320), 284);
  assert.equal(Character.evenUp(369, 370), 370);
  assert.equal(Character.evenUp(320, 320), 320);
});

test("validateManifest rejects unsupported prompt versions", () => {
  const manifest = Character.createManifest(validProject());
  manifest.prompt_version = "0.9.0";

  assert.throws(
    () => Character.validateManifest(manifest),
    /不支援的提示詞版本/
  );
});

test("identity changes invalidate an approved finalization", () => {
  assert.equal(Character.nextFinalizationStatus("approved", "style"), "invalidated");
  assert.equal(Character.nextFinalizationStatus("approved", "references"), "invalidated");
  assert.equal(Character.nextFinalizationStatus("approved", "defaultOutfit"), "approved");
  assert.equal(Character.nextFinalizationStatus("approved", "provider"), "approved");
  assert.equal(Character.nextFinalizationStatus("approved", "model"), "approved");
});


test("reference plan keeps normal project calls cheap and strict retry explicit", () => {
  assert.deepEqual(
    Character.referencePlan("quick", false),
    ["front", "top", "bottom", "left", "right"]
  );
  assert.deepEqual(Character.referencePlan("project", false), ["character"]);
  assert.deepEqual(
    Character.referencePlan("project", true),
    ["character", "front", "top", "bottom", "left", "right"]
  );
});

test("reference completeness requires front and grades one through five photos", () => {
  assert.deepEqual(Character.referenceCompleteness([]), {
    count: 0,
    ready: false,
    level: "missing",
    label: "請先上傳主要／正面照片",
  });
  assert.deepEqual(Character.referenceCompleteness(["front"]), {
    count: 1,
    ready: true,
    level: "base",
    label: "基礎一致性",
  });
  assert.equal(Character.referenceCompleteness(["front", "left"]).level, "better");
  assert.equal(Character.referenceCompleteness(["front", "top", "bottom", "left"]).level, "better");
  assert.equal(Character.referenceCompleteness(["front", "top", "bottom", "left", "right"]).level, "best");
  assert.equal(Character.referenceCompleteness(["left", "right"]).ready, false);
});

test("createManifest records only the reference photos that exist", () => {
  const manifest = Character.createManifest(validProject({
    referenceAngles: ["front", "left"],
  }));

  assert.deepEqual(manifest.references, {
    front: "references/front.png",
    left: "references/left.png",
  });
  assert.doesNotThrow(() => Character.validateManifest(manifest));
});
test("createManifest produces the versioned character contract", () => {
  const manifest = Character.createManifest(validProject());

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.provider, "openai");
  assert.equal(manifest.model, "gpt-image-2");
  assert.deepEqual(manifest.references, {
    front: "references/front.png",
    top: "references/top.png",
    bottom: "references/bottom.png",
    left: "references/left.png",
    right: "references/right.png",
  });
  assert.equal(manifest.character_image, "character.png");
  assert.equal(JSON.stringify(manifest).includes("api_key"), false);
});

test("validateManifest rejects unsupported versions", () => {
  const manifest = Character.createManifest(validProject());
  manifest.schema_version = 2;

  assert.throws(() => Character.validateManifest(manifest), /不支援的角色檔版本/);
});

test("validateManifest requires front and rejects unknown reference names", () => {
  const badProvider = Character.createManifest(validProject({ provider: "other" }));
  assert.throws(() => Character.validateManifest(badProvider), /AI 供應商/);

  const missingFront = Character.createManifest(validProject({
    referenceAngles: ["left"],
  }));
  assert.throws(() => Character.validateManifest(missingFront), /主要／正面參考圖/);

  const unknownReference = Character.createManifest(validProject());
  unknownReference.references.rear = "references/rear.png";
  assert.throws(() => Character.validateManifest(unknownReference), /不支援的參考圖/);
});

test("validateManifest rejects an empty identity description", () => {
  const manifest = Character.createManifest(validProject({ fixedTraits: "" }));

  assert.throws(() => Character.validateManifest(manifest), /固定角色特徵/);
});

test("validateManifest rejects unsupported style identifiers", () => {
  const manifest = Character.createManifest(validProject({ style: "unknown-style" }));

  assert.throws(() => Character.validateManifest(manifest), /插畫風格/);
});

test("validateManifest accepts every style exposed by the page", () => {
  ["sticker", "handdraw", "chibi", "watercolor", "lineart", "cartoon"].forEach(
    (style) => assert.doesNotThrow(
      () => Character.validateManifest(Character.createManifest(validProject({ style })))
    )
  );
});

function validArchiveSizes(referenceAngles) {
  const entries = ["manifest.json", "character.png"].concat(
    (referenceAngles || ["front", "top", "bottom", "left", "right"])
      .map((angle) => Character.REFERENCE_PATHS[angle])
  );
  return Object.fromEntries(
    entries.map((name) => [name, name === "manifest.json" ? 1024 : 2048])
  );
}

test("archive metadata validator enforces file whitelist and size limits", () => {
  assert.doesNotThrow(() => Character.validateArchiveMetadata(validArchiveSizes(), 4096));

  const extra = validArchiveSizes();
  extra["unexpected.txt"] = 1;
  assert.throws(() => Character.validateArchiveMetadata(extra, 4096), /不支援的檔案/);

  const hugeManifest = validArchiveSizes();
  hugeManifest["manifest.json"] = 256 * 1024 + 1;
  assert.throws(() => Character.validateArchiveMetadata(hugeManifest, 4096), /manifest/);

  assert.throws(
    () => Character.validateArchiveMetadata(validArchiveSizes(), 40 * 1024 * 1024 + 1),
    /40 MB/
  );

  const expanded = validArchiveSizes();
  expanded["character.png"] = 50 * 1024 * 1024;
  assert.throws(() => Character.validateArchiveMetadata(expanded, 4096), /解壓後/);
});

test("archive metadata accepts optional angles but still requires front", () => {
  assert.doesNotThrow(
    () => Character.validateArchiveMetadata(validArchiveSizes(["front"]), 4096)
  );
  assert.doesNotThrow(
    () => Character.validateArchiveMetadata(validArchiveSizes(["front", "left"]), 4096)
  );
  assert.throws(
    () => Character.validateArchiveMetadata(validArchiveSizes(["left"]), 4096),
    /主要／正面參考圖/
  );
});

test("archive metadata must match the references declared by the manifest", () => {
  const manifest = Character.createManifest(validProject());
  manifest.references = { front: Character.REFERENCE_PATHS.front };

  assert.throws(
    () => Character.validateArchiveMetadata(validArchiveSizes(), 4096, manifest),
    /與 manifest 不一致/
  );
});
