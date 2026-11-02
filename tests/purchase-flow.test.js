const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const Database = require("better-sqlite3");

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("purchase line total stays exact through FIFO sales and cancellation", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jmart-purchase-test-"));
  const databaseFile = path.join(tempDir, "jmart.sqlite");
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "server.js")], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATABASE_FILE: databaseFile, PORT: String(port), JWT_SECRET: "purchase-flow-test-only" },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let serverError = "";
  child.stderr.on("data", (chunk) => { serverError += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  let db;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}: ${serverError}`);
      try {
        ready = (await fetch(`${baseUrl}/api/health`)).ok;
        if (ready) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `test server did not start: ${serverError}`);

    async function request(route, method = "GET", body, token) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const data = await response.json();
      assert.equal(response.ok, true, `${route}: ${JSON.stringify(data)}`);
      return data;
    }

    const adminToken = (await request("/api/login", "POST", { role: "admin", password: "admin123" })).token;
    const memberToken = (await request("/api/login", "POST", { role: "member", userId: "u-001", password: "1111" })).token;
    const product = await request("/api/products", "POST", {
      code: "COST-TEST", name: "Cost test", categoryId: "cat-snack", image: "https://example.com/test.png", unit: "piece",
      cost: 0, price: 5, stock: 0, minStock: 0, favourite: false
    }, adminToken);

    const purchase = await request("/api/purchases", "POST", {
      docNo: "COST-TEST-PO", date: "2026-11-02", items: [{ productId: product.id, qty: 3, lineTotal: "10.00" }]
    }, adminToken);
    assert.equal(purchase.totalCost, 10);
    db = new Database(databaseFile, { readonly: true });
    const purchaseItem = db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ?").get(purchase.id);
    assert.equal(purchaseItem.line_total_cents, 1000);
    assert.ok(Math.abs(purchaseItem.cost - 10 / 3) < 1e-10);

    const sales = [];
    for (let i = 0; i < 3; i += 1) {
      sales.push(await request("/api/sales", "POST", { items: [{ productId: product.id, qty: 1 }] }, memberToken));
    }
    assert.deepEqual(sales.map((sale) => Math.round(sale.totalCost * 100)), [333, 333, 334]);
    let lot = db.prepare("SELECT * FROM inventory_lots WHERE purchase_id = ?").get(purchase.id);
    assert.equal(lot.remaining_qty, 0);
    assert.equal(lot.remaining_cost_cents, 0);

    await request(`/api/sales/${sales[1].id}/cancel`, "POST", {}, adminToken);
    lot = db.prepare("SELECT * FROM inventory_lots WHERE purchase_id = ?").get(purchase.id);
    assert.equal(lot.remaining_qty, 1);
    assert.equal(lot.remaining_cost_cents, 333);
    const resale = await request("/api/sales", "POST", { items: [{ productId: product.id, qty: 1 }] }, memberToken);
    assert.equal(resale.totalCost, 3.33);

    for (const sale of [sales[0], sales[2], resale]) {
      await request(`/api/sales/${sale.id}/cancel`, "POST", {}, adminToken);
    }
    lot = db.prepare("SELECT * FROM inventory_lots WHERE purchase_id = ?").get(purchase.id);
    assert.equal(lot.remaining_qty, 3);
    assert.equal(lot.remaining_cost_cents, 1000);
    await request(`/api/purchases/${purchase.id}/cancel`, "POST", {}, adminToken);
    lot = db.prepare("SELECT * FROM inventory_lots WHERE purchase_id = ?").get(purchase.id);
    assert.equal(lot.status, "cancelled");
    assert.equal(lot.remaining_cost_cents, 0);
  } finally {
    db?.close();
    if (child.exitCode == null && child.signalCode == null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
