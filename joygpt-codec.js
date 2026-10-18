/* JoyGPT's compiled C-to-WebAssembly demo module.
   This encodes a JoyGPT-only packet, NOT Nintendo's controller protocol. */
(function () {
  const WASM_BASE64 = "AGFzbQEAAAABDAJgBH9/f38AYAABfwMDAgABBQQBAQICBggBfwFBgIgECwcqAwZtZW1vcnkCAA1lbmNvZGVfcmVwb3J0AAANY29kZWNfdmVyc2lvbgABClsCVAAgA0EAOgAFIAMgADoAASADQaEBOgAAIAMgAEEIdjoAAiADQQAgAkH/ASACQf8BSRsgAkEASBs6AAQgA0EAIAFB/wEgAUH/AUkbIAFBAEgbOgADCwQAQQEL";

  window.loadJoyGPTCodec = async function () {
    if (!("WebAssembly" in window)) {
      throw new Error("WebAssembly is unavailable in this browser.");
    }
    const raw = atob(WASM_BASE64);
    const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
    const { instance } = await WebAssembly.instantiate(bytes);
    const exports = instance.exports;
    if (!exports.memory || !exports.encode_report || !exports.codec_version) {
      throw new Error("The compiled module is missing an expected export.");
    }
    const outputPointer = 4096;
    return {
      version: exports.codec_version(),
      encode(buttonMask, axisX, axisY) {
        exports.encode_report(buttonMask >>> 0, axisX | 0, axisY | 0, outputPointer);
        return Array.from(new Uint8Array(exports.memory.buffer, outputPointer, 6));
      }
    };
  };
})();
