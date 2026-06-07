const Database = require("better-sqlite3");
const path = require("node:path");

const databaseFile = process.env.DATABASE_FILE || path.join(__dirname, "..", "data", "jmart.sqlite");
const db = new Database(databaseFile);

const imagePools = {
  snack: [
    "https://images.unsplash.com/photo-1741520149938-4f08654780ef?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=60&w=1200",
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1622484212110-0c65f49e6ec6?auto=format&fit=crop&w=1200&q=80"
  ],
  beer: [
    "https://images.unsplash.com/photo-1566272794077-9b3d915d9e51?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=60&w=1200",
    "https://images.unsplash.com/photo-1681422695061-9023e14a28c1?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=60&w=1200"
  ],
  softDrink: [
    "https://images.unsplash.com/photo-1556710807-a9261921475f?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=60&w=1200",
    "https://images.unsplash.com/photo-1773188243371-e0dae4bab945?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=60&w=1200",
    "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=1200&q=80"
  ],
  readyMeal: [
    "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80"
  ],
  bakery: [
    "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=1200&q=80"
  ]
};

function pick(list, seed) {
  return list[seed % list.length];
}

function poolForCategory(name) {
  if (name === "Snacks") return imagePools.snack;
  if (name === "Beer") return imagePools.beer;
  if (name === "Coke & Soft Drinks") return imagePools.softDrink;
  if (name === "Ready Meals") return imagePools.readyMeal;
  if (name === "Bakery & Sandwiches") return imagePools.bakery;
  return null;
}

const rows = db.prepare(`
  SELECT p.id, p.name, p.code, c.name AS category_name
  FROM products p
  JOIN categories c ON c.id = p.category_id
  WHERE p.code LIKE 'JM-SMP-%'
  ORDER BY p.code
`).all();

const update = db.prepare("UPDATE products SET image = ? WHERE id = ?");

db.transaction(() => {
  rows.forEach((row, index) => {
    const pool = poolForCategory(row.category_name);
    if (!pool) return;
    update.run(pick(pool, index), row.id);
  });
})();

console.log(JSON.stringify({
  ok: true,
  databaseFile,
  updated: rows.length
}, null, 2));
