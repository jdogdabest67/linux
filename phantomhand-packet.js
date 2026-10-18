(function (global) {
  "use strict";

  const labels = {
    0: "B", 1: "A", 2: "Y", 3: "X",
    4: "L", 5: "R", 6: "ZL", 7: "ZR",
    8: "Minus", 9: "Plus", 10: "Left-stick click", 11: "Right-stick click",
    12: "D-pad up", 13: "D-pad down", 14: "D-pad left", 15: "D-pad right",
    16: "Home", 17: "Capture",
    18: "Left stick X", 19: "Left stick Y",
    20: "Right stick X", 21: "Right stick Y"
  };

  function assertByte(value, name, max) {
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new Error(name + " must be an integer from 0 to " + max + ".");
    }
  }

  function encodeFrame(id, value) {
    assertByte(id, "Command ID", 21);
    assertByte(value, "Command value", 255);
    return [0x53, id, value, 0x45]; // ASCII "S", payload, ASCII "E"
  }

  function parseHex(text) {
    const tokens = String(text).trim().split(/[\s,;]+/).filter(Boolean);
    if (!tokens.length) throw new Error("Enter hex bytes, for example: 53 01 01 45.");
    const bytes = tokens.map(function (token) {
      const cleaned = token.replace(/^0x/i, "");
      if (!/^[0-9a-f]{1,2}$/i.test(cleaned)) {
        throw new Error('"' + token + '" is not a one-byte hex value.');
      }
      return parseInt(cleaned, 16);
    });
    return bytes;
  }

  function decodeFrame(bytes) {
    if (!Array.isArray(bytes)) bytes = Array.from(bytes || []);
    if (bytes.length !== 4) {
      throw new Error("Expected exactly 4 bytes: 53 [command ID] [value] 45.");
    }
    if (bytes[0] !== 0x53 || bytes[3] !== 0x45) {
      throw new Error("Frame must start with ASCII S (53) and end with ASCII E (45).");
    }
    const id = bytes[1], value = bytes[2];
    if (!(id in labels)) throw new Error("Unknown command ID " + id + "; supported IDs are 0–21.");
    const isAxis = id >= 18 && id <= 21;
    let meaning;
    if (isAxis) {
      meaning = labels[id] + " = " + value + (value === 128 ? " (center)" : value < 128 ? " (below center)" : " (above center)");
    } else if (id >= 12 && id <= 15) {
      meaning = labels[id] + (value === 1 ? " held" : value === 0 ? " released" : " has unexpected value " + value);
    } else if (id <= 17) {
      meaning = labels[id] + (value === 1 ? " pressed" : value === 0 ? " released" : " has unexpected value " + value);
    } else {
      meaning = labels[id] + " = " + value;
    }

    const warnings = [];
    if (isAxis && (value === 0x45 || value === 0x53)) {
      warnings.push("FRAMING COLLISION: value " + value + " is ASCII " + (value === 0x45 ? "E" : "S") +
        ". The original Arduino parser treats those bytes as frame markers even inside the payload, so this axis value can corrupt the command.");
    }
    return { id: id, value: value, label: labels[id], meaning: meaning, warnings: warnings };
  }

  function hex(bytes) {
    return bytes.map(function (value) { return value.toString(16).padStart(2, "0").toUpperCase(); }).join(" ");
  }

  function init() {
    const idInput = document.getElementById("phCommandId");
    const valueInput = document.getElementById("phCommandValue");
    const output = document.getElementById("phPacketOutput");
    const decodeInput = document.getElementById("phDecodeInput");
    const decodeOutput = document.getElementById("phDecodeOutput");
    if (!idInput || !valueInput || !output || !decodeInput || !decodeOutput) return;

    function encodeAndShow() {
      try {
        const id = Number(idInput.value);
        const value = Number(valueInput.value);
        const bytes = encodeFrame(id, value);
        const decoded = decodeFrame(bytes);
        output.textContent =
          "Combined frame (hex): " + hex(bytes) +
          "\nUSB writes used by PhantomHand: " + hex([bytes[0]]) + " | " + hex(bytes.slice(1, 3)) + " | " + hex([bytes[3]]) +
          "\nASCII markers: S | [command ID, value] | E" +
          "\nDecoded: " + decoded.meaning +
          (decoded.warnings.length ? "\n\nWARNING: " + decoded.warnings.join("\n") : "") +
          "\n\nSIMULATION ONLY: this page has not opened USB/Bluetooth or sent these bytes anywhere.";
      } catch (error) {
        output.textContent = "Encode error: " + error.message;
      }
    }

    function decodeAndShow() {
      try {
        const bytes = parseHex(decodeInput.value);
        const decoded = decodeFrame(bytes);
        decodeOutput.textContent =
          "Bytes: " + hex(bytes) +
          "\nCommand ID: " + decoded.id + " (" + decoded.label + ")" +
          "\nValue: " + decoded.value +
          "\nMeaning: " + decoded.meaning +
          (decoded.warnings.length ? "\n\nWARNING: " + decoded.warnings.join("\n") : "");
      } catch (error) {
        decodeOutput.textContent = "Decode error: " + error.message;
      }
    }

    idInput.addEventListener("change", encodeAndShow);
    valueInput.addEventListener("input", encodeAndShow);
    decodeInput.addEventListener("input", decodeAndShow);
    document.querySelectorAll("[data-ph-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        const preset = button.getAttribute("data-ph-preset").split(",");
        idInput.value = preset[0];
        valueInput.value = preset[1];
        encodeAndShow();
      });
    });
    document.getElementById("phDecodeExample").addEventListener("click", function () {
      decodeInput.value = "53 01 01 45";
      decodeAndShow();
    });
    encodeAndShow();
    decodeAndShow();
  }

  global.PhantomHandPacket = {
    encodeFrame: encodeFrame,
    parseHex: parseHex,
    decodeFrame: decodeFrame,
    labels: labels
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
