const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const databaseFile = process.env.DATABASE_FILE || path.join(__dirname, "..", "data", "jmart.sqlite");
const db = new Database(databaseFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Math.random() * (max - min) + min) * factor) / factor;
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function isoDate(daysAgo = 0) {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  value.setHours(randomInt(7, 22), randomInt(0, 59), randomInt(0, 59), 0);
  return value.toISOString();
}

const categorySeeds = [
  { id: "cat-beer-sample", name: "Beer" },
  { id: "cat-coke-sample", name: "Coke & Soft Drinks" },
  { id: "cat-bakery-sample", name: "Bakery & Sandwiches" }
];

const snackBrands = ["Lay's", "Tasto", "Party", "Pocky", "Pretz", "Ko Kae", "Bento", "Tao Kae Noi", "Euro Cake", "Jack 'n Jill"];
const snackFlavours = ["Original", "BBQ", "Seaweed", "Sour Cream", "Hot Chili", "Tom Yum", "Truffle", "Cheese", "Nori", "Spicy Squid"];
const beerBrands = ["Chang", "Leo", "Singha", "Tiger", "Heineken", "Asahi", "Sapporo", "Hoegaarden"];
const beerSizes = ["320ml", "490ml", "500ml can", "620ml bottle", "ลัง 6 กระป๋อง"];
const softDrinkBrands = ["Coke", "Coke Zero", "Coke Vanilla", "Fanta Orange", "Sprite", "Schweppes Manao", "est Cola", "Pepsi Black"];
const softDrinkSizes = ["325ml", "450ml", "500ml", "1L", "1.25L"];
const readyMealNames = [
  "Krapao Pork with Rice",
  "Garlic Chicken Rice",
  "Green Curry Chicken Rice",
  "Teriyaki Chicken Rice",
  "Fried Rice with Sausage",
  "Shrimp Fried Rice",
  "Basil Crispy Pork Rice",
  "Chicken Porridge",
  "Spaghetti Carbonara",
  "Pad Thai"
];
const readyMealStyles = ["CP", "EZYGO", "7-Select", "Quick Meal", "Microwave"];
const bakeryNames = ["Ham Cheese Sandwich", "Tuna Sandwich", "Crab Salad Sandwich", "Sausage Bun", "Chocolate Croissant", "Red Bean Bun", "Butter Cake", "Banana Cake"];

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

function imageFromPool(type) {
  return pick(imagePools[type]);
}

function generateProducts(categoryIds) {
  const products = [];
  let sequence = 1;

  for (const brand of snackBrands) {
    for (const flavour of snackFlavours) {
      const name = `${brand} ${flavour}`;
      const cost = randomFloat(10, 28);
      products.push({
        id: `sample-product-${sequence}`,
        code: `JM-SMP-${String(sequence).padStart(4, "0")}`,
        image: imageFromPool("snack"),
        categoryId: categoryIds.snack,
        name,
        unit: "pack",
        cost,
        price: Math.round(cost * randomFloat(1.2, 1.7)),
        stock: 0,
        minStock: randomInt(4, 18),
        favourite: Math.random() > 0.82 ? 1 : 0
      });
      sequence += 1;
    }
  }

  for (const brand of beerBrands) {
    for (const size of beerSizes) {
      for (const variant of ["Classic", "Cold Brew", "Smooth"]) {
        const name = `${brand} ${variant} ${size}`;
        const cost = randomFloat(32, 95);
        products.push({
          id: `sample-product-${sequence}`,
          code: `JM-SMP-${String(sequence).padStart(4, "0")}`,
          image: imageFromPool("beer"),
          categoryId: categoryIds.beer,
          name,
          unit: size.includes("ลัง") ? "case" : "can",
          cost,
          price: Math.round(cost * randomFloat(1.15, 1.5)),
          stock: 0,
          minStock: randomInt(6, 24),
          favourite: Math.random() > 0.88 ? 1 : 0
        });
        sequence += 1;
      }
    }
  }

  for (const brand of softDrinkBrands) {
    for (const size of softDrinkSizes) {
      for (const temp of ["Chilled", "Regular", "Sugar Free"]) {
        const name = `${brand} ${temp} ${size}`;
        const cost = randomFloat(9, 28);
        products.push({
          id: `sample-product-${sequence}`,
          code: `JM-SMP-${String(sequence).padStart(4, "0")}`,
          image: imageFromPool("softDrink"),
          categoryId: categoryIds.softDrink,
          name,
          unit: size.includes("L") ? "bottle" : "bottle",
          cost,
          price: Math.round(cost * randomFloat(1.2, 1.55)),
          stock: 0,
          minStock: randomInt(8, 28),
          favourite: Math.random() > 0.85 ? 1 : 0
        });
        sequence += 1;
      }
    }
  }

  for (const meal of readyMealNames) {
    for (const style of readyMealStyles) {
      for (const spice of ["Mild", "Classic", "Spicy", "Extra Spicy"]) {
        const name = `${style} ${meal} (${spice})`;
        const cost = randomFloat(28, 58);
        products.push({
          id: `sample-product-${sequence}`,
          code: `JM-SMP-${String(sequence).padStart(4, "0")}`,
          image: imageFromPool("readyMeal"),
          categoryId: categoryIds.readyMeal,
          name,
          unit: "box",
          cost,
          price: Math.round(cost * randomFloat(1.15, 1.4)),
          stock: 0,
          minStock: randomInt(3, 12),
          favourite: Math.random() > 0.87 ? 1 : 0
        });
        sequence += 1;
      }
    }
  }

  for (const bakery of bakeryNames) {
    for (const combo of ["Fresh Daily", "Value Set", "Premium", "Cheese Lover", "Double Filling"]) {
      const name = `${bakery} ${combo}`;
      const cost = randomFloat(16, 42);
      products.push({
        id: `sample-product-${sequence}`,
        code: `JM-SMP-${String(sequence).padStart(4, "0")}`,
        image: imageFromPool("bakery"),
        categoryId: categoryIds.bakery,
        name,
        unit: "piece",
        cost,
        price: Math.round(cost * randomFloat(1.2, 1.55)),
        stock: 0,
        minStock: randomInt(4, 14),
        favourite: Math.random() > 0.9 ? 1 : 0
      });
      sequence += 1;
    }
  }

  return products;
}

function main() {
  const existingSample = db.prepare("SELECT COUNT(*) AS count FROM products WHERE code LIKE 'JM-SMP-%'").get().count;
  if (existingSample > 0) {
    console.log(`Sample products already exist (${existingSample}). Skipping to avoid duplicates.`);
    return;
  }

  const members = db.prepare("SELECT id, name FROM users WHERE role = 'member' ORDER BY name").all();
  if (!members.length) throw new Error("No member accounts found.");

  const categoriesInsert = db.prepare("INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)");
  categorySeeds.forEach((category) => categoriesInsert.run(category.id, category.name));

  const snackCategory = db.prepare("SELECT id FROM categories WHERE name = 'Snacks' LIMIT 1").get();
  const readyMealCategory = db.prepare("SELECT id FROM categories WHERE name = 'Ready Meals' LIMIT 1").get();
  const beerCategory = db.prepare("SELECT id FROM categories WHERE name = 'Beer' LIMIT 1").get();
  const softDrinkCategory = db.prepare("SELECT id FROM categories WHERE name = 'Coke & Soft Drinks' LIMIT 1").get();
  const bakeryCategory = db.prepare("SELECT id FROM categories WHERE name = 'Bakery & Sandwiches' LIMIT 1").get();

  const categoryIds = {
    snack: snackCategory?.id,
    readyMeal: readyMealCategory?.id,
    beer: beerCategory?.id,
    softDrink: softDrinkCategory?.id,
    bakery: bakeryCategory?.id
  };
  if (!categoryIds.snack || !categoryIds.readyMeal || !categoryIds.beer || !categoryIds.softDrink || !categoryIds.bakery) {
    throw new Error("Required categories are missing.");
  }

  const products = generateProducts(categoryIds);
  const insertProduct = db.prepare(`
    INSERT INTO products (id, code, image, category_id, name, unit, cost, price, stock, min_stock, favourite)
    VALUES (@id, @code, @image, @categoryId, @name, @unit, @cost, @price, @stock, @minStock, @favourite)
  `);

  const insertPurchase = db.prepare(`
    INSERT INTO purchases (id, doc_no, date, details, status, total_qty, total_cost)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `);
  const insertPurchaseItem = db.prepare(`
    INSERT INTO purchase_items (id, purchase_id, product_id, name, qty, unit, cost, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSale = db.prepare(`
    INSERT INTO sales (id, doc_no, date, user_id, user_name, total_qty, total, payment_type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Credit', 'active')
  `);
  const insertSaleItem = db.prepare(`
    INSERT INTO sale_items (id, sale_id, product_id, name, unit, price, qty)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const increaseStock = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
  const decreaseStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
  const increaseBalance = db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?");

  const currentStock = {};
  const inserted = db.transaction(() => {
    products.forEach((product) => {
      insertProduct.run(product);
      currentStock[product.id] = 0;
    });

    for (let index = 1; index <= 420; index += 1) {
      const purchaseId = id("po");
      const docNo = `PO-SMP-${String(index).padStart(5, "0")}`;
      const date = isoDate(randomInt(0, 180));
      const details = pick([
        "Restock from 7-11 style supplier assortment",
        "Weekly replenishment for high-demand items",
        "Cold shelf refill and snack promo load",
        "Ready-meal and beverage restock batch"
      ]);
      const chosenProducts = shuffle(products).slice(0, randomInt(2, 5));
      const items = chosenProducts.map((product) => {
        const qty = randomInt(6, 48);
        const cost = randomFloat(Math.max(1, product.cost * 0.9), product.cost * 1.08);
        const lineTotal = qty * cost;
        return { product, qty, cost, lineTotal };
      });
      const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
      const totalCost = items.reduce((sum, item) => sum + item.lineTotal, 0);
      insertPurchase.run(purchaseId, docNo, date, details, totalQty, totalCost);
      items.forEach(({ product, qty, cost, lineTotal }) => {
        currentStock[product.id] += qty;
        increaseStock.run(qty, product.id);
        insertPurchaseItem.run(id("poi"), purchaseId, product.id, product.name, qty, product.unit, cost, lineTotal);
      });
    }

    for (let index = 1; index <= 420; index += 1) {
      const available = products.filter((product) => currentStock[product.id] > 0);
      if (!available.length) break;
      const member = pick(members);
      const saleId = id("so");
      const docNo = `SO-SMP-${String(index).padStart(5, "0")}`;
      const date = isoDate(randomInt(0, 180));
      const chosenProducts = shuffle(available).slice(0, randomInt(1, 4));
      const items = [];

      chosenProducts.forEach((product) => {
        const maxQty = Math.min(currentStock[product.id], randomInt(1, 6));
        if (maxQty <= 0) return;
        const qty = randomInt(1, maxQty);
        const lineTotal = qty * product.price;
        items.push({ product, qty, lineTotal });
      });

      if (!items.length) continue;
      const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
      const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
      insertSale.run(saleId, docNo, date, member.id, member.name, totalQty, total);
      items.forEach(({ product, qty }) => {
        currentStock[product.id] -= qty;
        decreaseStock.run(qty, product.id);
        insertSaleItem.run(id("soi"), saleId, product.id, product.name, product.unit, product.price, qty);
      });
      increaseBalance.run(total, member.id);
    }
  })();

  const productCount = db.prepare("SELECT COUNT(*) AS count FROM products WHERE code LIKE 'JM-SMP-%'").get().count;
  const purchaseCount = db.prepare("SELECT COUNT(*) AS count FROM purchases WHERE doc_no LIKE 'PO-SMP-%'").get().count;
  const saleCount = db.prepare("SELECT COUNT(*) AS count FROM sales WHERE doc_no LIKE 'SO-SMP-%'").get().count;

  console.log(JSON.stringify({
    ok: true,
    databaseFile,
    sampleProducts: productCount,
    samplePurchases: purchaseCount,
    sampleSales: saleCount,
    totalSampleRecords: productCount + purchaseCount + saleCount
  }, null, 2));
}

main();
