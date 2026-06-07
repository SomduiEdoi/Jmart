const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");

const databaseFile = process.env.DATABASE_FILE || path.join(__dirname, "..", "data", "jmart.sqlite");
fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

const db = new Database(databaseFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      balance REAL NOT NULL DEFAULT 0,
      monthly_discount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      image TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0,
      favourite INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      doc_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      user_name TEXT NOT NULL,
      total_qty INTEGER NOT NULL,
      total REAL NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'Credit',
      status TEXT NOT NULL DEFAULT 'active',
      cancelled_at TEXT,
      cancelled_by TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      doc_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      cancelled_at TEXT,
      cancelled_by TEXT,
      total_qty INTEGER NOT NULL,
      total_cost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      cost REAL NOT NULL,
      line_total REAL NOT NULL DEFAULT 0
    );
  `);

  const saleColumns = db.prepare("PRAGMA table_info(sales)").all().map((column) => column.name);
  if (!saleColumns.includes("status")) {
    db.prepare("ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'active'").run();
  }
  if (!saleColumns.includes("cancelled_at")) {
    db.prepare("ALTER TABLE sales ADD COLUMN cancelled_at TEXT").run();
  }
  if (!saleColumns.includes("cancelled_by")) {
    db.prepare("ALTER TABLE sales ADD COLUMN cancelled_by TEXT").run();
  }

  const purchaseColumns = db.prepare("PRAGMA table_info(purchases)").all().map((column) => column.name);
  if (!purchaseColumns.includes("details")) {
    db.prepare("ALTER TABLE purchases ADD COLUMN details TEXT NOT NULL DEFAULT ''").run();
  }
  if (!purchaseColumns.includes("status")) {
    db.prepare("ALTER TABLE purchases ADD COLUMN status TEXT NOT NULL DEFAULT 'active'").run();
  }
  if (!purchaseColumns.includes("cancelled_at")) {
    db.prepare("ALTER TABLE purchases ADD COLUMN cancelled_at TEXT").run();
  }
  if (!purchaseColumns.includes("cancelled_by")) {
    db.prepare("ALTER TABLE purchases ADD COLUMN cancelled_by TEXT").run();
  }

  const purchaseItemColumns = db.prepare("PRAGMA table_info(purchase_items)").all().map((column) => column.name);
  if (!purchaseItemColumns.includes("unit")) {
    db.prepare("ALTER TABLE purchase_items ADD COLUMN unit TEXT NOT NULL DEFAULT ''").run();
  }
  if (!purchaseItemColumns.includes("line_total")) {
    db.prepare("ALTER TABLE purchase_items ADD COLUMN line_total REAL NOT NULL DEFAULT 0").run();
    db.prepare("UPDATE purchase_items SET line_total = qty * cost WHERE line_total = 0").run();
  }

  if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0) seed();
}

function seed() {
  const insertUser = db.prepare("INSERT INTO users (id, name, password_hash, role, balance, monthly_discount) VALUES (?, ?, ?, ?, ?, ?)");
  insertUser.run("admin", "Admin", bcrypt.hashSync("admin123", 10), "admin", 0, 0);
  insertUser.run("u-001", "Somchai", bcrypt.hashSync("1111", 10), "member", 0, 0);
  insertUser.run("u-002", "Suda", bcrypt.hashSync("2222", 10), "member", 0, 0);
  insertUser.run("u-003", "Narin", bcrypt.hashSync("3333", 10), "member", 0, 0);

  const insertCategory = db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)");
  insertCategory.run("cat-snack", "Snacks");
  insertCategory.run("cat-drink", "Drinks");
  insertCategory.run("cat-meal", "Ready Meals");

  const insertProduct = db.prepare(`
    INSERT INTO products (id, code, image, category_id, name, unit, cost, price, stock, min_stock, favourite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertProduct.run("p-001", "JM-0001", "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&q=80", "cat-snack", "Sugar Donut", "piece", 12, 18, 28, 8, 1);
  insertProduct.run("p-002", "JM-0002", "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=80", "cat-drink", "Thai Iced Tea", "cup", 15, 25, 42, 10, 1);
  insertProduct.run("p-003", "JM-0003", "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80", "cat-meal", "Fried Rice Box", "box", 28, 40, 12, 6, 0);
  insertProduct.run("p-004", "JM-0004", "https://images.unsplash.com/photo-1622484212110-0c65f49e6ec6?auto=format&fit=crop&w=600&q=80", "cat-snack", "Potato Chips", "bag", 18, 29, 7, 10, 0);
}

function userRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    balance: row.balance,
    monthlyDiscount: row.monthly_discount
  };
}

function productRow(row) {
  return {
    id: row.id,
    code: row.code,
    image: row.image,
    categoryId: row.category_id,
    name: row.name,
    unit: row.unit,
    cost: row.cost,
    price: row.price,
    stock: row.stock,
    minStock: row.min_stock,
    favourite: Boolean(row.favourite)
  };
}

function saleRow(row) {
  return {
    id: row.id,
    docNo: row.doc_no,
    date: row.date,
    userId: row.user_id,
    userName: row.user_name,
    totalQty: row.total_qty,
    total: row.total,
    paymentType: row.payment_type,
    status: row.status || "active",
    cancelledAt: row.cancelled_at || null,
    cancelledBy: row.cancelled_by || null,
    items: []
  };
}

function purchaseRow(row) {
  return {
    id: row.id,
    docNo: row.doc_no,
    date: row.date,
    details: row.details || "",
    status: row.status || "active",
    cancelledAt: row.cancelled_at || null,
    cancelledBy: row.cancelled_by || null,
    totalQty: row.total_qty,
    totalCost: row.total_cost,
    items: []
  };
}

module.exports = { db, id, initDb, userRow, productRow, saleRow, purchaseRow };
