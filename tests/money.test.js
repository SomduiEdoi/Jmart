const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMoneyCents, allocateCostCents } = require("../server/money");

test("money input keeps the invoice amount in whole satang", () => {
  assert.equal(parseMoneyCents("10.00"), 1000);
  assert.equal(parseMoneyCents("0.01"), 1);
  assert.throws(() => parseMoneyCents("10.001"), /two decimal places/);
});

test("FIFO allocation distributes the remainder without changing the line total", () => {
  let remainingCents = 1000;
  let remainingQty = 3;
  const unitCosts = [];
  while (remainingQty) {
    const cents = allocateCostCents(remainingCents, remainingQty, 1);
    unitCosts.push(cents);
    remainingCents -= cents;
    remainingQty -= 1;
  }
  assert.deepEqual(unitCosts, [333, 333, 334]);
  assert.equal(remainingCents, 0);
});

test("cancelling a sale restores its exact cost before the next allocation", () => {
  const first = allocateCostCents(1000, 3, 1);
  const second = allocateCostCents(1000 - first, 2, 1);
  const third = allocateCostCents(1000 - first - second, 1, 1);
  const next = allocateCostCents(first, 1, 1);
  assert.equal(second + third + next, 1000);
});

test("partial sales and sub-satang averages keep the original invoice total", () => {
  assert.equal(allocateCostCents(1000, 3, 2), 666);
  assert.equal(allocateCostCents(334, 1, 1), 334);
  assert.equal(allocateCostCents(1, 3, 1), 0);
  assert.equal(allocateCostCents(1, 2, 1), 0);
  assert.equal(allocateCostCents(1, 1, 1), 1);
});
