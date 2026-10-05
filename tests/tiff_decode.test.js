const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ window: {}, Uint8Array, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/shared/tiff-decode.js'), 'utf8'), context);
const decoder = context.window.TiffDecode;
function file(name, type, bytes = []) {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  blob.name = name;
  return blob;
}
test('accepts TIF and TIFF names with empty or generic MIME', async () => {
  assert.equal(await decoder.isTiff(file('scan.TIF', '')), true);
  assert.equal(await decoder.isTiff(file('scan.tiff', 'application/octet-stream')), true);
});
test('accepts TIFF MIME and both TIFF byte orders', async () => {
  assert.equal(await decoder.isTiff(file('scan', 'image/tiff')), true);
  assert.equal(await decoder.isTiff(file('scan', '', [73, 73, 42, 0])), true);
  assert.equal(await decoder.isTiff(file('scan', '', [77, 77, 0, 42])), true);
});
test('does not steal JPEG, AVIF, HEIC, or random binary input', async () => {
  for (const type of ['image/jpeg', 'image/avif', 'image/heic']) {
    assert.equal(await decoder.isTiff(file('scan', type, [73, 73, 42, 0])), false);
  }
  assert.equal(await decoder.isTiff(file('scan', '', [0, 0, 0, 0])), false);
});
test('invalid TIFF fails before downloading a decoder', async () => {
  await assert.rejects(decoder.decodeToImageData(new ArrayBuffer(3)), /不是有效的 TIF/);
});
