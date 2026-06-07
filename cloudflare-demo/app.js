const STORAGE_KEY = "jmart-cloudflare-demo-v1";

const seed = {
  currentUserId: null,
  activeTab: "pos",
  posCategory: "all",
  filters: { search: "", category: "all", stock: "none", alert: "all" },
  reportMonth: new Date().toISOString().slice(0, 7),
  users: [
    { id: "admin", name: "Admin", password: "admin123", role: "admin", balance: 0, monthlyDiscount: 0 },
    { id: "u-001", name: "Somchai", password: "1111", role: "member", balance: 0, monthlyDiscount: 0 },
    { id: "u-002", name: "Suda", password: "2222", role: "member", balance: 0, monthlyDiscount: 0 },
    { id: "u-003", name: "Narin", password: "3333", role: "member", balance: 0, monthlyDiscount: 0 }
  ],
  categories: [
    { id: "cat-snack", name: "Snacks" },
    { id: "cat-drink", name: "Drinks" },
    { id: "cat-meal", name: "Ready Meals" }
  ],
  products: [
    { id: "p-001", code: "JM-0001", image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&q=80", categoryId: "cat-snack", name: "Sugar Donut", unit: "piece", cost: 12, price: 18, stock: 28, minStock: 8, favourite: true },
    { id: "p-002", code: "JM-0002", image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=80", categoryId: "cat-drink", name: "Thai Iced Tea", unit: "cup", cost: 15, price: 25, stock: 42, minStock: 10, favourite: true },
    { id: "p-003", code: "JM-0003", image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80", categoryId: "cat-meal", name: "Fried Rice Box", unit: "box", cost: 28, price: 40, stock: 12, minStock: 6, favourite: false },
    { id: "p-004", code: "JM-0004", image: "https://images.unsplash.com/photo-1622484212110-0c65f49e6ec6?auto=format&fit=crop&w=600&q=80", categoryId: "cat-snack", name: "Potato Chips", unit: "bag", cost: 18, price: 29, stock: 7, minStock: 10, favourite: false }
  ],
  sales: [],
  purchases: []
};

let state = load();
let cart = [];

const app = document.getElementById("app");
const baht = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const number = new Intl.NumberFormat("th-TH");

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...structuredClone(seed), ...saved } : structuredClone(seed);
  } catch {
    return structuredClone(seed);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId);
}

function isAdmin() {
  return currentUser()?.role === "admin";
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function categoryName(id) {
  return state.categories.find((category) => category.id === id)?.name || "-";
}

function nextDocumentNumber(type) {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const list = type === "SO" ? state.sales : state.purchases;
  return `${type}-${ymd}-${String(list.filter((item) => item.docNo.startsWith(`${type}-${ymd}`)).length + 1).padStart(4, "0")}`;
}

function stockStatus(product) {
  if (product.stock <= 0) return { className: "out", label: "Out" };
  if (product.stock <= product.minStock) return { className: "low", label: "Low stock" };
  return { className: "good", label: "Available" };
}

function topSellingIds() {
  const counts = {};
  state.sales.forEach((sale) => sale.items.forEach((item) => (counts[item.productId] = (counts[item.productId] || 0) + item.qty)));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
}

function render() {
  if (!state.currentUserId) renderLogin();
  else renderApp();
}

function renderLogin() {
  const members = state.users.filter((user) => user.role === "member");
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-brand">
        <h1>J-Mart</h1>
        <p>Welcome to JZ Mini Mart! Your exclusive staff store with special discounts just for you. Every purchase you make helps us give back, as part of our profits is donated to children in need. Thank you for shopping with us and sharing the lovel !</p>
      </section>
      <section class="login-panel">
        <div class="section-head"><div><h2>Sign In</h2><p>Select Admin or choose your member account.</p></div></div>
        <form id="loginForm" class="form-grid">
          <label class="field full">Login type<select id="loginRole"><option value="member">Member</option><option value="admin">Admin</option></select></label>
          <label class="field full" id="memberSelectWrap">Member<select id="loginUser">${members.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}</select></label>
          <label class="field full">Password / PIN<input id="loginPassword" type="password" placeholder="Enter password or PIN" required /></label>
          <button class="btn primary field full" type="submit">Sign In</button>
        </form>
        <p style="color:var(--muted);margin-top:16px">Cloudflare demo data is stored in this browser only.</p>
      </section>
    </main>`;
  document.getElementById("loginRole").addEventListener("change", (event) => {
    document.getElementById("memberSelectWrap").classList.toggle("hidden", event.target.value === "admin");
  });
  document.getElementById("loginForm").addEventListener("submit", login);
}

function login(event) {
  event.preventDefault();
  const role = document.getElementById("loginRole").value;
  const password = document.getElementById("loginPassword").value;
  const user = role === "admin" ? state.users.find((item) => item.role === "admin") : state.users.find((item) => item.id === document.getElementById("loginUser").value);
  if (!user || user.password !== password) return alert("Incorrect password or PIN.");
  state.currentUserId = user.id;
  state.activeTab = user.role === "admin" ? "products" : "pos";
  save();
  render();
}

function renderApp() {
  const user = currentUser();
  const tabs = [
    { id: "products", label: "Products", adminOnly: true },
    { id: "salesReport", label: "Sales Report", adminOnly: true },
    { id: "purchaseReport", label: "Purchase Report", adminOnly: true },
    { id: "categories", label: "Categories", adminOnly: true },
    { id: "members", label: "Members", adminOnly: true },
    { id: "pos", label: "POS", adminOnly: false }
  ].filter((tab) => !tab.adminOnly || isAdmin());
  if (!tabs.some((tab) => tab.id === state.activeTab)) state.activeTab = "pos";
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand-mark"><div class="logo">J</div><div><strong>J-Mart</strong><span>Cloudflare Demo</span></div></div>
          <div class="user-actions">
            <div class="user-chip"><strong>${escapeHtml(user.name)}</strong><span>${isAdmin() ? "Admin" : `Outstanding ${baht.format(user.balance || 0)}`}</span></div>
            <button class="btn" data-action="account">Account</button>
            <button class="btn" data-action="reset-demo">Reset Demo</button>
            <button class="btn" data-action="logout">Logout</button>
          </div>
        </div>
        <nav class="tabs">${tabs.map((tab) => `<button class="tab ${state.activeTab === tab.id ? "active" : ""}" data-tab="${tab.id}">${tab.label}</button>`).join("")}</nav>
      </header>
      <main class="main">${renderTab()}</main>
    </div>`;
  app.querySelector('[data-action="logout"]').addEventListener("click", () => {
    state.currentUserId = null;
    cart = [];
    save();
    render();
  });
  app.querySelector('[data-action="account"]').addEventListener("click", openAccountModal);
  app.querySelector('[data-action="reset-demo"]').addEventListener("click", resetDemo);
  app.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    state.activeTab = button.dataset.tab;
    save();
    render();
  }));
  bindTabEvents();
}

function renderTab() {
  if (state.activeTab === "products") return renderProducts();
  if (state.activeTab === "salesReport") return renderSalesReport();
  if (state.activeTab === "purchaseReport") return renderPurchaseReport();
  if (state.activeTab === "categories") return renderCategories();
  if (state.activeTab === "members") return renderMembers();
  return renderPos();
}

function bindTabEvents() {
  if (state.activeTab === "products") bindProducts();
  if (state.activeTab === "salesReport" || state.activeTab === "purchaseReport") bindReports();
  if (state.activeTab === "categories") bindCategories();
  if (state.activeTab === "members") bindMembers();
  if (state.activeTab === "pos") bindPos();
}

function renderProducts() {
  const products = filteredProducts();
  return `
    <section>
      <div class="section-head">
        <div><h2>Products</h2><p>Create the product master list, scan product codes, mark favourites, and monitor low stock.</p></div>
        <div class="inline-actions"><button class="btn warn" data-action="scan-product">Scan QR</button><button class="btn primary" data-action="add-product">Add Product</button><button class="btn" data-action="add-purchase">Record Purchase</button></div>
      </div>
      <div class="panel">
        <div class="toolbar">
          <label class="field">Search<input id="productSearch" value="${escapeHtml(state.filters.search)}" placeholder="Code or product name" /></label>
          <label class="field">Category${categorySelect("productCategory", state.filters.category, true)}</label>
          <label class="field">Stock sort<select id="stockSort"><option value="none">No sorting</option><option value="desc" ${state.filters.stock === "desc" ? "selected" : ""}>High to low</option><option value="asc" ${state.filters.stock === "asc" ? "selected" : ""}>Low to high</option></select></label>
          <label class="field">Status<select id="alertFilter"><option value="all">All</option><option value="low" ${state.filters.alert === "low" ? "selected" : ""}>Low stock</option><option value="out" ${state.filters.alert === "out" ? "selected" : ""}>Out of stock</option></select></label>
        </div>
        <div class="list"><table><thead><tr><th>Image</th><th>Code</th><th>Category</th><th>Product</th><th>Unit</th><th>Cost</th><th>Price</th><th>Stock</th><th>Min</th><th>Status</th><th>Fav</th><th></th></tr></thead><tbody>${products.map(productRow).join("") || `<tr><td colspan="12"><div class="empty">No products found</div></td></tr>`}</tbody></table></div>
      </div>
    </section>`;
}

function productRow(product) {
  const status = stockStatus(product);
  return `<tr><td><img class="thumb" src="${escapeHtml(product.image)}" alt="" /></td><td>${escapeHtml(product.code)}</td><td>${escapeHtml(categoryName(product.categoryId))}</td><td>${escapeHtml(product.name)}</td><td>${escapeHtml(product.unit)}</td><td>${baht.format(product.cost)}</td><td>${baht.format(product.price)}</td><td>${number.format(product.stock)}</td><td>${number.format(product.minStock)}</td><td><span class="status ${status.className}">${status.label}</span></td><td><button class="icon-btn" title="Favourite" data-action="toggle-fav" data-id="${product.id}">${product.favourite ? "★" : "☆"}</button></td><td class="inline-actions"><button class="btn" data-action="edit-product" data-id="${product.id}">Edit</button><button class="btn danger" data-action="delete-product" data-id="${product.id}">Delete</button></td></tr>`;
}

function filteredProducts() {
  let products = [...state.products];
  const filters = state.filters;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    products = products.filter((product) => product.code.toLowerCase().includes(q) || product.name.toLowerCase().includes(q));
  }
  if (filters.category !== "all") products = products.filter((product) => product.categoryId === filters.category);
  if (filters.alert === "low") products = products.filter((product) => product.stock > 0 && product.stock <= product.minStock);
  if (filters.alert === "out") products = products.filter((product) => product.stock <= 0);
  if (filters.stock === "desc") products.sort((a, b) => b.stock - a.stock);
  if (filters.stock === "asc") products.sort((a, b) => a.stock - b.stock);
  return products;
}

function categorySelect(id, selected, includeAll = false) {
  return `<select id="${id}">${includeAll ? `<option value="all" ${selected === "all" ? "selected" : ""}>All</option>` : ""}${state.categories.map((category) => `<option value="${category.id}" ${selected === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select>`;
}

function bindProducts() {
  document.getElementById("productSearch").addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    save();
    render();
  });
  document.getElementById("productCategory").addEventListener("change", (event) => {
    state.filters.category = event.target.value;
    save();
    render();
  });
  document.getElementById("stockSort").addEventListener("change", (event) => {
    state.filters.stock = event.target.value;
    save();
    render();
  });
  document.getElementById("alertFilter").addEventListener("change", (event) => {
    state.filters.alert = event.target.value;
    save();
    render();
  });
  app.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleProductAction));
}

function handleProductAction(event) {
  const action = event.currentTarget.dataset.action;
  const id = event.currentTarget.dataset.id;
  if (action === "add-product") openProductModal();
  if (action === "edit-product") openProductModal(id);
  if (action === "delete-product") {
    if (!confirm("Delete this product?")) return;
    state.products = state.products.filter((product) => product.id !== id);
    save();
    render();
  }
  if (action === "toggle-fav") {
    const product = state.products.find((item) => item.id === id);
    product.favourite = !product.favourite;
    save();
    render();
  }
  if (action === "scan-product") {
    const code = prompt("Cloudflare demo: enter product code.");
    if (code) openProductModal(null, code);
  }
  if (action === "add-purchase") openPurchaseModal();
}

function openProductModal(id, scannedCode = "") {
  const product = state.products.find((item) => item.id === id) || { code: scannedCode || `JM-${String(state.products.length + 1).padStart(4, "0")}`, image: "", categoryId: state.categories[0]?.id || "", name: "", unit: "piece", cost: 0, price: 0, stock: 0, minStock: 0, favourite: false };
  openModal(`
    <h3>${id ? "Edit Product" : "Add Product"}</h3>
    <form id="productForm" class="form-grid three">
      <label class="field">Product code<input name="code" value="${escapeHtml(product.code)}" required /></label>
      <label class="field">Category${categorySelect("modalCategory", product.categoryId)}</label>
      <label class="field">Product name<input name="name" value="${escapeHtml(product.name)}" required /></label>
      <label class="field">Unit<input name="unit" value="${escapeHtml(product.unit)}" required /></label>
      <label class="field">Cost<input name="cost" type="number" min="0" step="0.01" value="${product.cost}" /></label>
      <label class="field">Sale price<input name="price" type="number" min="0" step="0.01" value="${product.price}" /></label>
      <label class="field">Stock<input name="stock" type="number" min="0" step="1" value="${product.stock}" /></label>
      <label class="field">Minimum stock<input name="minStock" type="number" min="0" step="1" value="${product.minStock}" /></label>
      <label class="field">Favourite<select name="favourite"><option value="false">No</option><option value="true" ${product.favourite ? "selected" : ""}>Yes</option></select></label>
      <label class="field full">Image URL<input name="image" value="${escapeHtml(product.image)}" placeholder="https://..." /></label>
      <div class="dropzone field full" id="dropzone">Drop an image here or choose a file <input name="imageFile" type="file" accept="image/*" /></div>
      <div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>`);
  setupImageInput();
  document.getElementById("productForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const imageFile = form.get("imageFile");
    let image = form.get("image").trim();
    if (imageFile?.size) image = await fileToDataUrl(imageFile);
    const payload = { id: id || uid("p"), code: form.get("code").trim(), image: image || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=600&q=80", categoryId: document.getElementById("modalCategory").value, name: form.get("name").trim(), unit: form.get("unit").trim(), cost: Number(form.get("cost") || 0), price: Number(form.get("price") || 0), stock: Number(form.get("stock") || 0), minStock: Number(form.get("minStock") || 0), favourite: form.get("favourite") === "true" };
    if (id) state.products = state.products.map((item) => (item.id === id ? payload : item));
    else state.products.push(payload);
    save();
    closeModal();
    render();
  });
}

function setupImageInput() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = dropzone.querySelector("input");
  dropzone.addEventListener("dragover", (event) => event.preventDefault());
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer.files.length) fileInput.files = event.dataTransfer.files;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openPurchaseModal() {
  openModal(`<h3>Record Purchase</h3><form id="purchaseForm" class="form-grid">${state.products.map((product) => `<label class="field">${escapeHtml(product.name)} (${escapeHtml(product.code)})<input name="${product.id}" type="number" min="0" step="1" value="0" /></label>`).join("")}<div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save Purchase</button></div></form>`);
  document.getElementById("purchaseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const items = state.products.map((product) => ({ productId: product.id, name: product.name, qty: Number(form.get(product.id) || 0), cost: product.cost })).filter((item) => item.qty > 0);
    if (!items.length) return alert("Please enter at least one purchase quantity.");
    items.forEach((item) => (state.products.find((product) => product.id === item.productId).stock += item.qty));
    state.purchases.push({ id: uid("po"), docNo: nextDocumentNumber("PO"), date: new Date().toISOString(), items, totalQty: items.reduce((sum, item) => sum + item.qty, 0), totalCost: items.reduce((sum, item) => sum + item.qty * item.cost, 0) });
    save();
    closeModal();
    render();
  });
}

function renderSalesReport() {
  const sales = byMonth(state.sales, state.reportMonth);
  return reportShell("Sales Report", sales, summarizeByDate(sales, "total"), summarizeByMember(sales), true);
}

function renderPurchaseReport() {
  const purchases = byMonth(state.purchases, state.reportMonth);
  return reportShell("Purchase Report", purchases, summarizeByDate(purchases, "totalCost"), null, false);
}

function reportShell(title, rows, daily, members, isSales) {
  const qty = rows.reduce((sum, item) => sum + item.totalQty, 0);
  const amount = rows.reduce((sum, item) => sum + (isSales ? item.total : item.totalCost), 0);
  return `<section><div class="section-head"><div><h2>${title}</h2><p>Review daily totals by month, including quantities and amount summaries.</p></div><label class="field" style="max-width:220px">Month<input id="reportMonth" type="month" value="${state.reportMonth}" /></label></div><div class="summary-grid"><div class="metric"><span>Documents</span><strong>${number.format(rows.length)}</strong></div><div class="metric"><span>Quantity</span><strong>${number.format(qty)}</strong></div><div class="metric"><span>Total amount</span><strong>${baht.format(amount)}</strong></div><div class="metric"><span>Month</span><strong>${state.reportMonth}</strong></div></div><div class="panel"><h3>Daily Summary</h3><div class="list" style="margin-top:12px"><table><thead><tr><th>Date</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>${daily.map((item) => `<tr><td>${item.date}</td><td>${number.format(item.qty)}</td><td>${baht.format(item.amount)}</td></tr>`).join("") || `<tr><td colspan="3"><div class="empty">No data yet</div></td></tr>`}</tbody></table></div></div>${members ? `<div class="panel" style="margin-top:16px"><h3>Member Purchase Summary</h3><div class="list" style="margin-top:12px"><table><thead><tr><th>Member</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>${members.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${number.format(item.qty)}</td><td>${baht.format(item.amount)}</td></tr>`).join("") || `<tr><td colspan="3"><div class="empty">No data yet</div></td></tr>`}</tbody></table></div></div>` : ""}</section>`;
}

function byMonth(list, month) {
  return list.filter((item) => item.date.slice(0, 7) === month);
}

function summarizeByDate(list, amountKey) {
  const map = {};
  list.forEach((item) => {
    const date = item.date.slice(0, 10);
    if (!map[date]) map[date] = { date, qty: 0, amount: 0 };
    map[date].qty += item.totalQty;
    map[date].amount += item[amountKey];
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeByMember(list) {
  const map = {};
  list.forEach((sale) => {
    if (!map[sale.userId]) map[sale.userId] = { name: sale.userName, qty: 0, amount: 0 };
    map[sale.userId].qty += sale.totalQty;
    map[sale.userId].amount += sale.total;
  });
  return Object.values(map).sort((a, b) => b.amount - a.amount);
}

function bindReports() {
  document.getElementById("reportMonth").addEventListener("change", (event) => {
    state.reportMonth = event.target.value;
    save();
    render();
  });
}

function renderCategories() {
  return `<section><div class="section-head"><div><h2>Categories</h2><p>Add, edit, or remove product categories used in the POS.</p></div><button class="btn primary" data-action="add-category">Add Category</button></div><div class="panel"><div class="list"><table><thead><tr><th>Category</th><th>Products</th><th></th></tr></thead><tbody>${state.categories.map((category) => `<tr><td>${escapeHtml(category.name)}</td><td>${state.products.filter((product) => product.categoryId === category.id).length}</td><td class="inline-actions"><button class="btn" data-action="edit-category" data-id="${category.id}">Edit</button><button class="btn danger" data-action="delete-category" data-id="${category.id}">Delete</button></td></tr>`).join("")}</tbody></table></div></div></section>`;
}

function bindCategories() {
  app.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.id;
    if (button.dataset.action === "add-category") openCategoryModal();
    if (button.dataset.action === "edit-category") openCategoryModal(id);
    if (button.dataset.action === "delete-category") {
      if (state.products.some((product) => product.categoryId === id)) return alert("This category still has products.");
      state.categories = state.categories.filter((category) => category.id !== id);
      save();
      render();
    }
  }));
}

function openCategoryModal(id) {
  const category = state.categories.find((item) => item.id === id) || { name: "" };
  openModal(`<h3>${id ? "Edit Category" : "Add Category"}</h3><form id="categoryForm" class="form-grid"><label class="field full">Category name<input name="name" value="${escapeHtml(category.name)}" required /></label><div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
  document.getElementById("categoryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = new FormData(event.target).get("name").trim();
    if (id) state.categories = state.categories.map((item) => (item.id === id ? { ...item, name } : item));
    else state.categories.push({ id: uid("cat"), name });
    save();
    closeModal();
    render();
  });
}

function renderMembers() {
  const members = state.users.filter((user) => user.role === "member");
  return `<section><div class="section-head"><div><h2>Members</h2><p>Manage member accounts, outstanding credit, monthly discounts, and settlement.</p></div><button class="btn primary" data-action="add-user">Add Member</button></div><div class="panel"><div class="list"><table><thead><tr><th>User name</th><th>Password</th><th>Outstanding</th><th>Special discount</th><th>Net payable</th><th></th></tr></thead><tbody>${members.map((user) => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.password)}</td><td>${baht.format(user.balance || 0)}</td><td>${baht.format(user.monthlyDiscount || 0)}</td><td>${baht.format(Math.max(0, user.balance - user.monthlyDiscount))}</td><td class="inline-actions"><button class="btn" data-action="edit-user" data-id="${user.id}">Edit</button><button class="btn warn" data-action="pay-user" data-id="${user.id}">Settle</button><button class="btn danger" data-action="delete-user" data-id="${user.id}">Delete</button></td></tr>`).join("")}</tbody></table></div></div></section>`;
}

function bindMembers() {
  app.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === "add-user") openUserModal();
    if (action === "edit-user") openUserModal(id);
    if (action === "pay-user") payUser(id);
    if (action === "delete-user") {
      if (!confirm("Delete this member?")) return;
      state.users = state.users.filter((user) => user.id !== id);
      save();
      render();
    }
  }));
}

function openUserModal(id) {
  const user = state.users.find((item) => item.id === id) || { name: "", password: "", balance: 0, monthlyDiscount: 0 };
  openModal(`<h3>${id ? "Edit Member" : "Add Member"}</h3><form id="userForm" class="form-grid"><label class="field">User name<input name="name" value="${escapeHtml(user.name)}" required /></label><label class="field">Password / PIN<input name="password" value="${escapeHtml(user.password)}" required /></label><label class="field">Outstanding balance<input name="balance" type="number" min="0" step="0.01" value="${user.balance || 0}" /></label><label class="field">Monthly special discount<input name="monthlyDiscount" type="number" min="0" step="0.01" value="${user.monthlyDiscount || 0}" /></label><div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
  document.getElementById("userForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = { id: id || uid("u"), role: "member", name: form.get("name").trim(), password: form.get("password").trim(), balance: Number(form.get("balance") || 0), monthlyDiscount: Number(form.get("monthlyDiscount") || 0) };
    if (id) state.users = state.users.map((item) => (item.id === id ? payload : item));
    else state.users.push(payload);
    save();
    closeModal();
    render();
  });
}

function openAccountModal() {
  const user = currentUser();
  openModal(`<h3>Account Settings</h3><form id="accountForm" class="form-grid"><label class="field">User name<input name="name" value="${escapeHtml(user.name)}" required /></label><label class="field">Password / PIN<input name="password" value="${escapeHtml(user.password)}" required /></label><div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
  document.getElementById("accountForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    user.name = form.get("name").trim();
    user.password = form.get("password").trim();
    save();
    closeModal();
    render();
  });
}

function payUser(id) {
  const user = state.users.find((item) => item.id === id);
  const payable = Math.max(0, user.balance - user.monthlyDiscount);
  if (!confirm(`Confirm settlement of ${baht.format(payable)} for ${user.name}?`)) return;
  user.balance = 0;
  user.monthlyDiscount = 0;
  save();
  render();
}

function renderPos() {
  const selling = topSellingIds();
  const visibleProducts = state.products.filter((product) => product.stock > 0 && (state.posCategory === "all" || product.categoryId === state.posCategory));
  const featured = visibleProducts.filter((product) => product.favourite || selling.includes(product.id));
  const regular = visibleProducts.filter((product) => !featured.includes(product));
  return `<section><div class="section-head"><div><h2>POS</h2><p>Select products and save each checkout as credit for later settlement.</p></div><div class="metric" style="min-width:220px"><span>Outstanding</span><strong>${baht.format(currentUser().balance || 0)}</strong></div></div><div class="pos-grid"><div><div class="category-strip"><button class="chip ${state.posCategory === "all" ? "active" : ""}" data-category="all">All</button>${state.categories.map((category) => `<button class="chip ${state.posCategory === category.id ? "active" : ""}" data-category="${category.id}">${escapeHtml(category.name)}</button>`).join("")}</div>${featured.length ? `<h3>Best Sellers / Favourites</h3><div class="product-grid" style="margin:12px 0 22px">${featured.map((product) => productCard(product, selling)).join("")}</div>` : ""}<h3>Products</h3><div class="product-grid" style="margin-top:12px">${regular.map((product) => productCard(product, selling)).join("") || `<div class="empty">No available products</div>`}</div></div><aside class="panel cart"><h3>Sales Bill</h3><p style="color:var(--muted)">No. ${nextDocumentNumber("SO")}</p><div class="cart-items">${cart.map(cartRow).join("") || `<div class="empty">Select products from the left</div>`}</div><div class="cart-total"><span>Total</span><strong>${baht.format(cartTotal())}</strong></div><button class="btn primary" style="width:100%;margin-top:14px" data-action="checkout" ${cart.length ? "" : "disabled"}>Save as Credit</button></aside></div></section>`;
}

function productCard(product, selling) {
  return `<button class="product-card" data-product="${product.id}"><img src="${escapeHtml(product.image)}" alt="" /><div class="badges">${selling.includes(product.id) ? `<span class="badge" title="Best seller">↗</span>` : ""}${product.favourite ? `<span class="badge fav" title="Favourite">★</span>` : ""}</div><div class="product-card-body"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(categoryName(product.categoryId))} • ${number.format(product.stock)} ${escapeHtml(product.unit)} left</small><strong>${baht.format(product.price)}</strong></div></button>`;
}

function cartRow(item) {
  return `<div class="cart-row"><div><strong>${escapeHtml(item.name)}</strong><br><small>${baht.format(item.price)} / ${escapeHtml(item.unit)}</small></div><div class="qty"><button class="icon-btn" data-action="dec" data-id="${item.productId}">−</button><strong>${item.qty}</strong><button class="icon-btn" data-action="inc" data-id="${item.productId}">+</button></div></div>`;
}

function bindPos() {
  app.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    state.posCategory = button.dataset.category;
    save();
    render();
  }));
  app.querySelectorAll("[data-product]").forEach((button) => button.addEventListener("click", () => addToCart(button.dataset.product)));
  app.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "inc") addToCart(button.dataset.id);
    if (action === "dec") decrementCart(button.dataset.id);
    if (action === "checkout") checkout();
  }));
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  const existing = cart.find((item) => item.productId === productId);
  const currentQty = existing?.qty || 0;
  if (currentQty >= product.stock) return alert("Not enough stock.");
  if (existing) existing.qty += 1;
  else cart.push({ productId, name: product.name, unit: product.unit, price: product.price, qty: 1 });
  render();
}

function decrementCart(productId) {
  const existing = cart.find((item) => item.productId === productId);
  if (!existing) return;
  existing.qty -= 1;
  if (existing.qty <= 0) cart = cart.filter((item) => item.productId !== productId);
  render();
}

function cartTotal() {
  return cart.reduce((sum, item) => sum + item.qty * item.price, 0);
}

function checkout() {
  if (!cart.length) return;
  if (isAdmin()) return alert("Please sign in as a member to save an outstanding credit balance.");
  const user = currentUser();
  const sale = { id: uid("so"), docNo: nextDocumentNumber("SO"), date: new Date().toISOString(), userId: user.id, userName: user.name, items: cart.map((item) => ({ ...item })), totalQty: cart.reduce((sum, item) => sum + item.qty, 0), total: cartTotal(), paymentType: "Credit" };
  sale.items.forEach((item) => (state.products.find((product) => product.id === item.productId).stock -= item.qty));
  user.balance += sale.total;
  state.sales.push(sale);
  cart = [];
  save();
  alert(`Sale ${sale.docNo} saved as Credit.`);
  render();
}

function resetDemo() {
  if (!confirm("Reset demo data in this browser?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(seed);
  cart = [];
  render();
}

function openModal(html) {
  const wrapper = document.createElement("div");
  wrapper.className = "modal-backdrop";
  wrapper.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(wrapper);
  wrapper.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closeModal));
  wrapper.addEventListener("click", (event) => {
    if (event.target === wrapper) closeModal();
  });
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

render();
