const path = require("node:path");
const bcrypt = require("bcryptjs");

const databaseFile = path.join(__dirname, "..", "data", "jmart.sqlite.org");
process.env.DATABASE_FILE = databaseFile;

const { db, initDb } = require("../server/db");

initDb();

db.transaction(() => {
  db.prepare("DELETE FROM sale_items").run();
  db.prepare("DELETE FROM sales").run();
  db.prepare("DELETE FROM purchase_items").run();
  db.prepare("DELETE FROM purchases").run();
  db.prepare("DELETE FROM products").run();
  db.prepare("DELETE FROM categories").run();
  db.prepare("DELETE FROM users WHERE role <> 'admin'").run();

  const admin = db.prepare("SELECT id FROM users WHERE id = 'admin' AND role = 'admin'").get();
  if (!admin) {
    db.prepare("INSERT INTO users (id, name, password_hash, role, balance, monthly_discount) VALUES (?, ?, ?, 'admin', 0, 0)").run(
      "admin",
      "Admin",
      bcrypt.hashSync("admin123", 10)
    );
  } else {
    db.prepare("UPDATE users SET name = 'Admin', balance = 0, monthly_discount = 0 WHERE id = 'admin' AND role = 'admin'").run();
  }
})();

db.pragma("wal_checkpoint(TRUNCATE)");
db.close();

console.log(JSON.stringify({ ok: true, databaseFile }, null, 2));
