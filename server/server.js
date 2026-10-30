require("dotenv").config();

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db, id, initDb, userRow, productRow, saleRow, purchaseRow } = require("./db");

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || "dev-only-change-me";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "12h";

initDb();

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = userRow(db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub));
  } catch {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: "Authentication required." });
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}

function memberList(publicOnly = false) {
  const rows = db.prepare("SELECT * FROM users WHERE role = 'member' ORDER BY name").all();
  return rows.map((row) => {
    const user = userRow(row);
    return publicOnly ? { id: user.id, name: user.name } : user;
  });
}

function categories() {
  return db.prepare("SELECT id, name FROM categories ORDER BY name").all();
}

function products() {
  return db.prepare("SELECT * FROM products ORDER BY name").all().map(productRow);
}

function sales() {
  const rows = db.prepare("SELECT * FROM sales ORDER BY date DESC").all().map(saleRow);
  const items = db.prepare("SELECT * FROM sale_items ORDER BY rowid").all();
  const bySale = Object.fromEntries(rows.map((sale) => [sale.id, sale]));
  items.forEach((item) => {
    if (bySale[item.sale_id]) {
      bySale[item.sale_id].items.push({
        productId: item.product_id,
        name: item.name,
        unit: item.unit,
        price: item.price,
        qty: item.qty,
        cost: item.cost || 0,
        lineCost: item.line_cost || 0,
        profit: item.profit || item.qty * item.price - (item.line_cost || 0)
      });
    }
  });
  return rows;
}

function consumeFifoLots(productId, qty) {
  let remaining = qty;
  const lots = db.prepare(`
    SELECT * FROM inventory_lots
    WHERE product_id = ? AND status = 'active' AND remaining_qty > 0
    ORDER BY date, rowid
  `).all(productId);
  const consumed = [];
  lots.forEach((lot) => {
    if (remaining <= 0) return;
    const takeQty = Math.min(remaining, lot.remaining_qty);
    consumed.push({ lot, qty: takeQty, cost: lot.cost, lineCost: takeQty * lot.cost });
    remaining -= takeQty;
  });
  if (remaining > 0) throw new Error("Not enough FIFO stock cost layers for this sale.");
  return consumed;
}

function purchases() {
  const rows = db.prepare("SELECT * FROM purchases ORDER BY date DESC").all().map(purchaseRow);
  const items = db.prepare("SELECT * FROM purchase_items ORDER BY rowid").all();
  const byPurchase = Object.fromEntries(rows.map((purchase) => [purchase.id, purchase]));
  items.forEach((item) => {
    if (byPurchase[item.purchase_id]) {
      byPurchase[item.purchase_id].items.push({
        productId: item.product_id,
        name: item.name,
        unit: item.unit,
        cost: item.cost,
        qty: item.qty,
        lineTotal: item.line_total ?? item.qty * item.cost
      });
    }
  });
  return rows;
}

function nextDocumentNumber(type) {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const table = type === "SO" ? "sales" : "purchases";
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE doc_no LIKE ?`).get(`${type}-${ymd}-%`);
  return `${type}-${ymd}-${String(row.count + 1).padStart(4, "0")}`;
}

function assertText(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required.`);
  return String(value).trim();
}

function assertNumber(value, label, min = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) throw new Error(`${label} must be ${min} or greater.`);
  return number;
}

function handleError(res, error) {
  const message = error.message || "Request failed.";
  const status = /required|must|stock|exists|still has/i.test(message) ? 400 : 500;
  res.status(status).json({ error: message });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/bootstrap", optionalAuth, (req, res) => {
  const admin = req.user?.role === "admin";
  res.json({
    currentUser: req.user || null,
    users: memberList(!admin),
    categories: categories(),
    products: products(),
    sales: admin ? sales() : sales().filter((sale) => sale.userId === req.user?.id),
    purchases: admin ? purchases() : []
  });
});

app.post("/api/login", (req, res) => {
  const role = req.body.role === "admin" ? "admin" : "member";
  const user = role === "admin" ? db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get() : db.prepare("SELECT * FROM users WHERE id = ? AND role = 'member'").get(req.body.userId);
  if (!user || !bcrypt.compareSync(String(req.body.password || ""), user.password_hash)) {
    return res.status(401).json({ error: "Incorrect password or PIN." });
  }
  const safeUser = userRow(user);
  res.json({ token: sign(safeUser), user: safeUser });
});

app.put("/api/account", requireAuth, (req, res) => {
  try {
    const name = assertText(req.body.name, "User name");
    const password = String(req.body.password || "").trim();
    if (password) {
      db.prepare("UPDATE users SET name = ?, password_hash = ? WHERE id = ?").run(name, bcrypt.hashSync(password, 10), req.user.id);
    } else {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, req.user.id);
    }
    res.json(userRow(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)));
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/api/categories", requireAuth, requireAdmin, (req, res) => {
  try {
    const category = { id: id("cat"), name: assertText(req.body.name, "Category name") };
    db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)").run(category.id, category.name);
    res.status(201).json(category);
  } catch (error) {
    handleError(res, error);
  }
});

app.put("/api/categories/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(assertText(req.body.name, "Category name"), req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/api/categories/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const count = db.prepare("SELECT COUNT(*) AS count FROM products WHERE category_id = ?").get(req.params.id).count;
    if (count) throw new Error("This category still has products.");
    db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/api/products", requireAuth, requireAdmin, (req, res) => {
  try {
    const product = normalizeProduct(req.body, id("p"), 0);
    db.prepare(`
      INSERT INTO products (id, code, image, category_id, name, unit, cost, price, stock, min_stock, favourite)
      VALUES (@id, @code, @image, @categoryId, @name, @unit, @cost, @price, @stock, @minStock, @favourite)
    `).run({ ...product, favourite: product.favourite ? 1 : 0 });
    res.status(201).json(product);
  } catch (error) {
    handleError(res, error);
  }
});

app.put("/api/products/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const existing = db.prepare("SELECT stock, cost FROM products WHERE id = ?").get(req.params.id);
    if (!existing) throw new Error("Product not found.");
    const product = normalizeProduct(req.body, req.params.id, existing.stock, existing.cost);
    db.prepare(`
      UPDATE products
      SET code = @code, image = @image, category_id = @categoryId, name = @name, unit = @unit,
          cost = @cost, price = @price, stock = @stock, min_stock = @minStock, favourite = @favourite
      WHERE id = @id
    `).run({ ...product, favourite: product.favourite ? 1 : 0 });
    res.json(product);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch("/api/products/:id/favourite", requireAuth, requireAdmin, (req, res) => {
  try {
    db.prepare("UPDATE products SET favourite = CASE favourite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/api/products/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

function normalizeProduct(body, productId, stock, cost = null) {
  return {
    id: productId,
    code: assertText(body.code, "Product code"),
    image: assertText(body.image, "Image URL"),
    categoryId: assertText(body.categoryId, "Category"),
    name: assertText(body.name, "Product name"),
    unit: assertText(body.unit, "Unit"),
    cost: cost === null ? assertNumber(body.cost, "Cost") : assertNumber(cost, "Cost"),
    price: assertNumber(body.price, "Sale price"),
    stock: Math.floor(assertNumber(stock, "Stock")),
    minStock: Math.floor(assertNumber(body.minStock, "Minimum stock")),
    favourite: Boolean(body.favourite)
  };
}

app.post("/api/members", requireAuth, requireAdmin, (req, res) => {
  try {
    const password = assertText(req.body.password, "Password / PIN");
    const member = {
      id: id("u"),
      name: assertText(req.body.name, "User name"),
      balance: 0,
      monthlyDiscount: assertNumber(req.body.monthlyDiscount, "Monthly special discount")
    };
    db.prepare("INSERT INTO users (id, name, password_hash, role, balance, monthly_discount) VALUES (?, ?, ?, 'member', ?, ?)").run(member.id, member.name, bcrypt.hashSync(password, 10), member.balance, member.monthlyDiscount);
    res.status(201).json(member);
  } catch (error) {
    handleError(res, error);
  }
});

app.put("/api/members/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const existing = db.prepare("SELECT balance FROM users WHERE id = ? AND role = 'member'").get(req.params.id);
    if (!existing) throw new Error("Member not found.");
    const name = assertText(req.body.name, "User name");
    const discount = assertNumber(req.body.monthlyDiscount, "Monthly special discount");
    const password = String(req.body.password || "").trim();
    if (password) {
      db.prepare("UPDATE users SET name = ?, password_hash = ?, balance = ?, monthly_discount = ? WHERE id = ? AND role = 'member'").run(
        name,
        bcrypt.hashSync(password, 10),
        existing.balance,
        discount,
        req.params.id
      );
    } else {
      db.prepare("UPDATE users SET name = ?, balance = ?, monthly_discount = ? WHERE id = ? AND role = 'member'").run(
        name,
        existing.balance,
        discount,
        req.params.id
      );
    }
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/api/members/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM users WHERE id = ? AND role = 'member'").run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/api/members/:id/settle", requireAuth, requireAdmin, (req, res) => {
  try {
    const member = db.prepare("SELECT id, name, balance, monthly_discount FROM users WHERE id = ? AND role = 'member'").get(req.params.id);
    if (!member) throw new Error("Member not found.");
    const amount = assertNumber(req.body.amount, "Payment amount", 0.01);
    const payable = Math.max(0, member.balance - member.monthly_discount);
    if (payable <= 0) throw new Error("This member has no payable balance.");
    if (amount > payable) throw new Error("Payment amount cannot exceed the current net payable balance.");
    db.prepare("UPDATE users SET balance = balance - ? WHERE id = ? AND role = 'member'").run(amount, req.params.id);
    res.json({ ok: true, paymentAmount: amount, remainingPayable: Math.max(0, payable - amount) });
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/api/purchases", requireAuth, requireAdmin, (req, res) => {
  try {
    const purchase = db.transaction((body) => {
      const docNo = assertText(body.docNo, "Document No.");
      const details = String(body.details || "").trim();
      const chosenDate = assertText(body.date, "Date");
      const date = new Date(chosenDate);
      if (Number.isNaN(date.getTime())) throw new Error("Date is invalid.");
      if (db.prepare("SELECT 1 FROM purchases WHERE doc_no = ?").get(docNo)) {
        throw new Error("Document No. already exists.");
      }
      const items = body.items;
      if (!Array.isArray(items) || items.length === 0) throw new Error("Purchase items are required.");
      const prepared = items.map((item) => {
        const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.productId);
        if (!product) throw new Error("Product not found.");
        const qty = Math.floor(assertNumber(item.qty, "Quantity", 1));
        const cost = assertNumber(item.cost, "Unit cost", 0);
        return { product, qty, cost, lineTotal: qty * cost };
      });
      const totalQty = prepared.reduce((sum, item) => sum + item.qty, 0);
      const totalCost = prepared.reduce((sum, item) => sum + item.lineTotal, 0);
      const purchaseId = id("po");
      const purchaseDate = date.toISOString();
      db.prepare("INSERT INTO purchases (id, doc_no, date, details, total_qty, total_cost) VALUES (?, ?, ?, ?, ?, ?)").run(
        purchaseId,
        docNo,
        purchaseDate,
        details,
        totalQty,
        totalCost
      );
      const insertItem = db.prepare("INSERT INTO purchase_items (id, purchase_id, product_id, name, qty, unit, cost, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      const insertLot = db.prepare(`
        INSERT INTO inventory_lots (id, purchase_item_id, purchase_id, product_id, date, qty, remaining_qty, cost, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `);
      const addStock = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
      prepared.forEach((item) => {
        const purchaseItemId = id("poi");
        insertItem.run(purchaseItemId, purchaseId, item.product.id, item.product.name, item.qty, item.product.unit, item.cost, item.lineTotal);
        insertLot.run(id("lot"), purchaseItemId, purchaseId, item.product.id, purchaseDate, item.qty, item.qty, item.cost);
        addStock.run(item.qty, item.product.id);
      });
      return { id: purchaseId, docNo, date: purchaseDate, details, totalQty, totalCost };
    })(req.body);
    res.status(201).json(purchase);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/api/purchases/:id/cancel", requireAuth, requireAdmin, (req, res) => {
  try {
    const cancelled = db.transaction((purchaseId) => {
      const purchase = db.prepare("SELECT * FROM purchases WHERE id = ?").get(purchaseId);
      if (!purchase) throw new Error("Purchase document not found.");
      if ((purchase.status || "active") === "cancelled") throw new Error("This purchase has already been cancelled.");

      const items = db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY rowid").all(purchaseId);
      items.forEach((item) => {
        const product = db.prepare("SELECT stock, name FROM products WHERE id = ?").get(item.product_id);
        if (!product) throw new Error("Product not found.");
        if (product.stock < item.qty) {
          throw new Error(`This purchase cannot be cancelled because stock for ${product.name} is lower than the received quantity.`);
        }
        const lot = db.prepare("SELECT remaining_qty FROM inventory_lots WHERE purchase_item_id = ? AND status = 'active'").get(item.id);
        if (lot && lot.remaining_qty < item.qty) {
          throw new Error(`This purchase cannot be cancelled because FIFO stock for ${product.name} has already been sold.`);
        }
      });

      const removeStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
      items.forEach((item) => {
        removeStock.run(item.qty, item.product_id);
      });
      db.prepare("UPDATE inventory_lots SET remaining_qty = 0, status = 'cancelled' WHERE purchase_id = ?").run(purchaseId);

      db.prepare("UPDATE purchases SET status = 'cancelled', cancelled_at = ?, cancelled_by = ? WHERE id = ?").run(
        new Date().toISOString(),
        req.user.name,
        purchaseId
      );

      return purchaseRow(db.prepare("SELECT * FROM purchases WHERE id = ?").get(purchaseId));
    })(req.params.id);

    res.json(cancelled);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/api/sales", requireAuth, (req, res) => {
  try {
    if (req.user.role !== "member") throw new Error("Please sign in as a member to save an outstanding credit balance.");
    const sale = db.transaction((items) => {
      if (!Array.isArray(items) || items.length === 0) throw new Error("Sale items are required.");
      const prepared = items.map((item) => {
        const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.productId);
        if (!product) throw new Error("Product not found.");
        const qty = Math.floor(assertNumber(item.qty, "Quantity", 1));
        if (qty > product.stock) throw new Error(`Not enough stock for ${product.name}.`);
        return { product, qty };
      });
      const totalQty = prepared.reduce((sum, item) => sum + item.qty, 0);
      const total = prepared.reduce((sum, item) => sum + item.qty * item.product.price, 0);
      const preparedWithCost = prepared.map((item) => {
        const lots = consumeFifoLots(item.product.id, item.qty);
        const lineCost = lots.reduce((sum, lot) => sum + lot.lineCost, 0);
        return { ...item, lots, lineCost, cost: lineCost / item.qty, profit: item.qty * item.product.price - lineCost };
      });
      const totalCost = preparedWithCost.reduce((sum, item) => sum + item.lineCost, 0);
      const profit = total - totalCost;
      const saleId = id("so");
      const docNo = nextDocumentNumber("SO");
      const date = new Date().toISOString();
      db.prepare("INSERT INTO sales (id, doc_no, date, user_id, user_name, total_qty, total, total_cost, profit, payment_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Credit')").run(saleId, docNo, date, req.user.id, req.user.name, totalQty, total, totalCost, profit);
      const insertItem = db.prepare("INSERT INTO sale_items (id, sale_id, product_id, name, unit, price, qty, cost, line_cost, profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const insertSaleLot = db.prepare("INSERT INTO sale_item_lots (id, sale_item_id, lot_id, qty, cost, line_cost) VALUES (?, ?, ?, ?, ?, ?)");
      const updateLot = db.prepare("UPDATE inventory_lots SET remaining_qty = remaining_qty - ? WHERE id = ?");
      const removeStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
      preparedWithCost.forEach((item) => {
        const saleItemId = id("soi");
        insertItem.run(saleItemId, saleId, item.product.id, item.product.name, item.product.unit, item.product.price, item.qty, item.cost, item.lineCost, item.profit);
        item.lots.forEach((consumed) => {
          insertSaleLot.run(id("sil"), saleItemId, consumed.lot.id, consumed.qty, consumed.cost, consumed.lineCost);
          updateLot.run(consumed.qty, consumed.lot.id);
        });
        removeStock.run(item.qty, item.product.id);
      });
      db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(total, req.user.id);
      return { id: saleId, docNo, date, totalQty, total, totalCost, profit, paymentType: "Credit" };
    })(req.body.items);
    res.status(201).json(sale);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/api/sales/:id/cancel", requireAuth, requireAdmin, (req, res) => {
  try {
    const cancelled = db.transaction((saleId) => {
      const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId);
      if (!sale) throw new Error("Sale document not found.");
      if ((sale.status || "active") === "cancelled") throw new Error("This sale has already been cancelled.");
      const member = db.prepare("SELECT balance FROM users WHERE id = ?").get(sale.user_id);
      if (!member) throw new Error("Member not found.");
      if (member.balance < sale.total) {
        throw new Error("This sale cannot be cancelled because the member balance is already lower than the document total.");
      }

      const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY rowid").all(saleId);
      const restoreStock = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
      const restoreLot = db.prepare("UPDATE inventory_lots SET remaining_qty = remaining_qty + ? WHERE id = ?");
      items.forEach((item) => {
        const lots = db.prepare("SELECT * FROM sale_item_lots WHERE sale_item_id = ?").all(item.id);
        lots.forEach((lot) => restoreLot.run(lot.qty, lot.lot_id));
        restoreStock.run(item.qty, item.product_id);
      });

      db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(sale.total, sale.user_id);
      db.prepare("UPDATE sales SET status = 'cancelled', cancelled_at = ?, cancelled_by = ? WHERE id = ?").run(
        new Date().toISOString(),
        req.user.name,
        saleId
      );

      return saleRow(db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId));
    })(req.params.id);

    res.json(cancelled);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(port, () => {
  console.log(`J-Mart listening on port ${port}`);
});
