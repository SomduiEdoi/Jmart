const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const Database = require("better-sqlite3");
const ExcelJS = require("exceljs");

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
      price: 5.01, minStock: 0, favourite: false
    }, adminToken);
    assert.equal(product.stock, 0);
    const exportResponse = await fetch(`${baseUrl}/api/products/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ productIds: [product.id] })
    });
    assert.equal(exportResponse.ok, true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
    assert.deepEqual(workbook.getWorksheet("Products").getRow(1).values.slice(1), [
      "Code", "Category", "Product", "Unit", "Price (THB)", "Stock", "Minimum Stock", "Status"
    ]);

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
    assert.deepEqual(sales.map((sale) => sale.total), [5.01, 5.01, 5.01]);
    assert.deepEqual(sales.map((sale) => sale.profit), [1.68, 1.68, 1.67]);
    assert.equal(sales.reduce((cents, sale) => cents + Math.round(sale.profit * 100), 0), 503);
    assert.deepEqual(db.prepare("SELECT total_cents, total_cost_cents, profit_cents FROM sales WHERE id = ?").get(sales[2].id), {
      total_cents: 501, total_cost_cents: 334, profit_cents: 167
    });
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

    const olderPurchase = await request("/api/purchases", "POST", {
      docNo: "COST-TEST-OLDER", date: "2026-11-02", items: [{ productId: product.id, qty: 2, lineTotal: "8.00" }]
    }, adminToken);
    const newerPurchase = await request("/api/purchases", "POST", {
      docNo: "COST-TEST-NEWER", date: "2026-11-02", items: [{ productId: product.id, qty: 3, lineTotal: "10.00" }]
    }, adminToken);
    const crossLotSale = await request("/api/sales", "POST", { items: [{ productId: product.id, qty: 3 }] }, memberToken);
    const finalSale = await request("/api/sales", "POST", { items: [{ productId: product.id, qty: 2 }] }, memberToken);
    assert.deepEqual([crossLotSale.total, crossLotSale.totalCost, crossLotSale.profit], [15.03, 11.33, 3.7]);
    assert.deepEqual([finalSale.total, finalSale.totalCost, finalSale.profit], [10.02, 6.67, 3.35]);
    assert.deepEqual(db.prepare("SELECT line_revenue_cents, line_cost_cents, profit_cents FROM sale_items WHERE sale_id = ?").get(crossLotSale.id), {
      line_revenue_cents: 1503, line_cost_cents: 1133, profit_cents: 370
    });
    assert.equal(Math.round((crossLotSale.profit + finalSale.profit) * 100), 705);
    assert.equal(db.prepare("SELECT remaining_cost_cents FROM inventory_lots WHERE purchase_id = ?").get(olderPurchase.id).remaining_cost_cents, 0);
    assert.equal(db.prepare("SELECT remaining_cost_cents FROM inventory_lots WHERE purchase_id = ?").get(newerPurchase.id).remaining_cost_cents, 0);
    const reportSales = (await request("/api/bootstrap", "GET", undefined, adminToken)).sales;
    assert.equal(reportSales.find((sale) => sale.id === crossLotSale.id).profit, 3.7);
    assert.equal(reportSales.find((sale) => sale.id === finalSale.id).profit, 3.35);
  } finally {
    db?.close();
    if (child.exitCode == null && child.signalCode == null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
