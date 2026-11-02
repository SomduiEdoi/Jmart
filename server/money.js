function parseMoneyCents(value, label = "Amount") {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error(`${label} must be a non-negative amount with at most two decimal places.`);
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error(`${label} is too large.`);
  return cents;
}

function roundedCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function allocateCostCents(remainingCents, remainingQty, takeQty) {
  if (!Number.isSafeInteger(remainingCents) || remainingCents < 0 ||
      !Number.isSafeInteger(remainingQty) || remainingQty < 1 ||
      !Number.isSafeInteger(takeQty) || takeQty < 1 || takeQty > remainingQty) {
    throw new Error("Invalid FIFO cost allocation.");
  }
  if (takeQty === remainingQty) return remainingCents;
  return Number(BigInt(remainingCents) * BigInt(takeQty) / BigInt(remainingQty));
}

module.exports = { parseMoneyCents, roundedCents, allocateCostCents };
