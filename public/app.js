const TOKEN_KEY = "jmart-token";

const ui = {
  activeTab: "pos",
  posCategory: "all",
  productFilters: { search: "", category: "all", stock: "none", alert: "all" },
  productPage: 1,
  reportMonth: new Date().toISOString().slice(0, 7),
  reportMember: "all",
  reportStatus: "all",
  exportStart: new Date().toISOString().slice(0, 7) + "-01",
  exportEnd: new Date().toISOString().slice(0, 10)
};

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  currentUser: null,
  users: [],
  categories: [],
  products: [],
  sales: [],
  purchases: []
};

let cart = [];
let productSearchTimer = null;

const app = document.getElementById("app");
const baht = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" });
const number = new Intl.NumberFormat("th-TH");
const PRODUCT_PAGE_SIZE = 50;

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    logout(false);
    throw new Error("Session expired. Please sign in again.");
  }
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

async function loadData() {
  const data = await api("/api/bootstrap");
  state.currentUser = data.currentUser;
  state.users = data.users || [];
  state.categories = data.categories || [];
  state.products = data.products || [];
  state.sales = data.sales || [];
  state.purchases = data.purchases || [];
}

async function init() {
  try {
    await loadData();
  } catch {
    state.token = null;
    localStorage.removeItem(TOKEN_KEY);
    await loadData();
  }
  render();
}

function isAdmin() {
  return state.currentUser?.role === "admin";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function categoryName(id) {
  return state.categories.find((category) => category.id === id)?.name || "-";
}

function actionIcon(action, id, icon, label, variant = "") {
  return `<button class="icon-action ${variant}" type="button" data-action="${action}" data-id="${id}" title="${label}" aria-label="${label}">${icon}</button>`;
}

function stockStatus(product) {
  if (product.stock <= 0) return { className: "out", label: "Out" };
  if (product.stock <= product.minStock) return { className: "low", label: "Low stock" };
  return { className: "good", label: "Available" };
}

function topSellingIds() {
  const counts = {};
  state.sales.filter((sale) => sale.status !== "cancelled").forEach((sale) => {
    sale.items.forEach((item) => {
      counts[item.productId] = (counts[item.productId] || 0) + item.qty;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
}

function render() {
  if (!state.currentUser) renderLogin();
  else renderApp();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-brand">
        <h1>J-Mart</h1>
        <p>Welcome to JZ Mini Mart! Your exclusive staff store with special discounts just for you. Every purchase you make helps us give back, as part of our profits is donated to children in need. Thank you for shopping with us and sharing the lovel !</p>
      </section>
      <section class="login-panel">
        <div class="section-head">
          <div>
            <h2>Sign In</h2>
            <p>Select Admin or choose your member account.</p>
          </div>
        </div>
        <form id="loginForm" class="form-grid">
          <label class="field full">
            Login type
            <select id="loginRole">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label class="field full" id="memberSelectWrap">
            Member
            <select id="loginUser">
              ${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field full">
            Password / PIN
            <input id="loginPassword" type="password" autocomplete="current-password" placeholder="Enter password or PIN" required />
          </label>
          <button class="btn primary field full" type="submit">Sign In</button>
        </form>
      </section>
    </main>
  `;

  document.getElementById("loginRole").addEventListener("change", (event) => {
    document.getElementById("memberSelectWrap").classList.toggle("hidden", event.target.value === "admin");
  });
  document.getElementById("loginForm").addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const role = document.getElementById("loginRole").value;
  const password = document.getElementById("loginPassword").value;
  const userId = document.getElementById("loginUser").value;
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ role, userId, password })
    });
    state.token = result.token;
    localStorage.setItem(TOKEN_KEY, result.token);
    ui.activeTab = result.user.role === "admin" ? "dashboard" : "pos";
    await loadData();
    render();
  } catch (error) {
    alert(error.message);
  }
}

function renderApp() {
  const tabs = [
    { id: "dashboard", label: "Dashboard", adminOnly: true },
    { id: "products", label: "Products", adminOnly: true },
    { id: "purchases", label: "Purchases", adminOnly: true },
    { id: "salesReport", label: "Sales Report", adminOnly: true },
    { id: "purchaseReport", label: "Purchase Report", adminOnly: true },
    { id: "categories", label: "Categories", adminOnly: true },
    { id: "members", label: "Members", adminOnly: true },
    { id: "purchaseHistory", label: "Purchase History", adminOnly: false, memberOnly: true },
    { id: "pos", label: "POS", adminOnly: false }
  ].filter((tab) => (!tab.adminOnly || isAdmin()) && (!tab.memberOnly || !isAdmin()));

  if (!tabs.some((tab) => tab.id === ui.activeTab)) ui.activeTab = "pos";

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand-mark">
            <div class="logo">J</div>
            <div><strong>J-Mart</strong><span>Employee Welfare POS</span></div>
          </div>
          <div class="user-actions">
            <div class="user-chip"><strong>${escapeHtml(state.currentUser.name)}</strong><span>${isAdmin() ? "Admin" : `Outstanding ${baht.format(state.currentUser.balance || 0)}`}</span></div>
            <button class="btn" data-action="account">Account</button>
            <button class="btn" data-action="logout">Logout</button>
          </div>
        </div>
        <nav class="tabs">
          ${tabs.map((tab) => `<button class="tab ${ui.activeTab === tab.id ? "active" : ""}" data-tab="${tab.id}">${tab.label}</button>`).join("")}
        </nav>
      </header>
      <main class="main">${renderTab()}</main>
    </div>
  `;

  app.querySelector('[data-action="logout"]').addEventListener("click", () => logout());
  app.querySelector('[data-action="account"]').addEventListener("click", openAccountModal);
  app.querySelectorAll("[data-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      ui.activeTab = button.dataset.tab;
      render();
    })
  );
  bindTabEvents();
}

function logout(shouldRender = true) {
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  cart = [];
  if (shouldRender) render();
}

function renderTab() {
  if (ui.activeTab === "dashboard") return renderDashboard();
  if (ui.activeTab === "products") return renderProducts();
  if (ui.activeTab === "purchases") return renderPurchases();
  if (ui.activeTab === "salesReport") return renderSalesReport();
  if (ui.activeTab === "purchaseReport") return renderPurchaseReport();
  if (ui.activeTab === "categories") return renderCategories();
  if (ui.activeTab === "members") return renderMembers();
  if (ui.activeTab === "purchaseHistory") return renderPurchaseHistory();
  return renderPos();
}

function bindTabEvents() {
  if (ui.activeTab === "dashboard") bindDashboard();
  if (ui.activeTab === "products") bindProducts();
  if (ui.activeTab === "purchases") bindPurchases();
  if (ui.activeTab === "salesReport" || ui.activeTab === "purchaseReport") bindReports();
  if (ui.activeTab === "categories") bindCategories();
  if (ui.activeTab === "members") bindMembers();
  if (ui.activeTab === "pos") bindPos();
  if (ui.activeTab === "purchaseHistory") bindPurchaseHistory();
}

function renderDashboard() {
  const sales = activeDocuments(byMonth(state.sales, ui.reportMonth));
  const purchases = activeDocuments(byMonth(state.purchases, ui.reportMonth));
  const daily = summarizeSalesByDate(sales);
  const salesAmount = sales.reduce((sum, sale) => sum + sale.total, 0);
  const salesCost = sales.reduce((sum, sale) => sum + (sale.totalCost || 0), 0);
  const profit = sales.reduce((sum, sale) => sum + (sale.profit || sale.total - (sale.totalCost || 0)), 0);
  const purchaseAmount = purchases.reduce((sum, purchase) => sum + purchase.totalCost, 0);
  return `
    <section>
      <div class="section-head">
        <div><h2>Dashboard</h2><p>Monthly sales, cost, and profit overview.</p></div>
        <label class="field" style="max-width:220px">Month<input id="dashboardMonth" type="month" value="${ui.reportMonth}" /></label>
      </div>
      <div class="summary-grid">
        <div class="metric"><span>Sales amount</span><strong>${baht.format(salesAmount)}</strong></div>
        <div class="metric"><span>Cost of goods sold</span><strong>${baht.format(salesCost)}</strong></div>
        <div class="metric"><span>Gross profit</span><strong>${baht.format(profit)}</strong></div>
        <div class="metric"><span>Purchases</span><strong>${baht.format(purchaseAmount)}</strong></div>
      </div>
      <div class="panel" style="margin-top:16px">
        <h3>Dairy Summary</h3>
        <div class="list" style="margin-top:12px">
          <table>
            <thead><tr><th>Date</th><th>Quantity</th><th>Sales</th><th>Cost</th><th>Profit</th></tr></thead>
            <tbody>${daily.map((item) => `<tr><td>${item.date}</td><td>${number.format(item.qty)}</td><td>${baht.format(item.amount)}</td><td>${baht.format(item.cost)}</td><td>${baht.format(item.profit)}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty">No data yet</div></td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </section>`;
}

function bindDashboard() {
  document.getElementById("dashboardMonth").addEventListener("change", (event) => {
    ui.reportMonth = event.target.value;
    render();
  });
}

function renderProducts() {
  const products = filteredProducts();
  const totalPages = Math.max(1, Math.ceil(products.length / PRODUCT_PAGE_SIZE));
  if (ui.productPage > totalPages) ui.productPage = totalPages;
  const pageProducts = products.slice((ui.productPage - 1) * PRODUCT_PAGE_SIZE, ui.productPage * PRODUCT_PAGE_SIZE);
  return `
    <section>
      <div class="section-head">
        <div><h2>Products</h2><p>Create the product master list, scan product codes, mark favourites, and monitor low stock.</p></div>
        <div class="inline-actions">
          <button class="btn warn" data-action="scan-product">Scan QR</button>
          <button class="btn primary" data-action="add-product">Add Product</button>
        </div>
      </div>
      <div class="panel">
        <div class="toolbar product-toolbar">
          <label class="field">Search<input id="productSearch" value="${escapeHtml(ui.productFilters.search)}" placeholder="Code or product name" /></label>
          <label class="field">Category${categorySelect("productCategory", ui.productFilters.category, true)}</label>
          <label class="field">Sort by<select id="stockSort"><option value="none">No sorting</option><option value="fav" ${ui.productFilters.stock === "fav" ? "selected" : ""}>Favourite first</option><option value="desc" ${ui.productFilters.stock === "desc" ? "selected" : ""}>Stock high to low</option><option value="asc" ${ui.productFilters.stock === "asc" ? "selected" : ""}>Stock low to high</option></select></label>
          <label class="field">Status<select id="alertFilter"><option value="all">All</option><option value="low" ${ui.productFilters.alert === "low" ? "selected" : ""}>Low stock</option><option value="out" ${ui.productFilters.alert === "out" ? "selected" : ""}>Out of stock</option></select></label>
        </div>
        <div class="list">
          <table class="product-table">
            <thead><tr><th>Image</th><th>Code</th><th>Category</th><th>Product</th><th>Unit</th><th>Cost</th><th>Price</th><th>Stock</th><th>Min</th><th>Status</th><th>Fav</th><th></th></tr></thead>
            <tbody>${pageProducts.map(productRow).join("") || `<tr><td colspan="12"><div class="empty">No products found</div></td></tr>`}</tbody>
          </table>
        </div>
        <div class="product-pagination">
          <div class="product-pagination-meta">Showing ${products.length ? `${number.format((ui.productPage - 1) * PRODUCT_PAGE_SIZE + 1)}-${number.format(Math.min(ui.productPage * PRODUCT_PAGE_SIZE, products.length))}` : "0"} of ${number.format(products.length)} items</div>
          <div class="product-pagination-controls">
            <button class="btn compact" id="productPrevPage" ${ui.productPage <= 1 ? "disabled" : ""}>Previous</button>
            <span class="product-pagination-page">Page ${number.format(ui.productPage)} / ${number.format(totalPages)}</span>
            <button class="btn compact" id="productNextPage" ${ui.productPage >= totalPages ? "disabled" : ""}>Next</button>
          </div>
        </div>
      </div>
    </section>`;
}

function productRow(product) {
  const status = stockStatus(product);
  return `
    <tr>
      <td><img class="thumb" src="${escapeHtml(product.image)}" alt="" /></td>
      <td>${escapeHtml(product.code)}</td>
      <td>${escapeHtml(categoryName(product.categoryId))}</td>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.unit)}</td>
      <td>${baht.format(product.cost)}</td>
      <td>${baht.format(product.price)}</td>
      <td>${number.format(product.stock)}</td>
      <td>${number.format(product.minStock)}</td>
      <td><span class="status ${status.className}">${status.label}</span></td>
      <td><button class="icon-action" title="Favourite" aria-label="Favourite" data-action="toggle-fav" data-id="${product.id}">${product.favourite ? "★" : "☆"}</button></td>
      <td class="inline-actions action-cell">${actionIcon("edit-product", product.id, "✎", "Edit product")}${actionIcon("delete-product", product.id, "×", "Delete product", "danger")}</td>
    </tr>`;
}

function filteredProducts() {
  const filters = ui.productFilters;
  let products = [...state.products];
  if (filters.search) {
    const q = filters.search.toLowerCase();
    products = products.filter((product) => product.code.toLowerCase().includes(q) || product.name.toLowerCase().includes(q));
  }
  if (filters.category !== "all") products = products.filter((product) => product.categoryId === filters.category);
  if (filters.alert === "low") products = products.filter((product) => product.stock > 0 && product.stock <= product.minStock);
  if (filters.alert === "out") products = products.filter((product) => product.stock <= 0);
  if (filters.stock === "fav") products.sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
  if (filters.stock === "desc") products.sort((a, b) => b.stock - a.stock);
  if (filters.stock === "asc") products.sort((a, b) => a.stock - b.stock);
  return products;
}

function categorySelect(id, selected, includeAll = false) {
  return `<select id="${id}">
    ${includeAll ? `<option value="all" ${selected === "all" ? "selected" : ""}>All</option>` : ""}
    ${state.categories.map((category) => `<option value="${category.id}" ${selected === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}
  </select>`;
}

function bindProducts() {
  document.getElementById("productSearch").addEventListener("input", (event) => {
    ui.productFilters.search = event.target.value;
    ui.productPage = 1;
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => {
      render();
      const searchInput = document.getElementById("productSearch");
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }, 250);
  });
  document.getElementById("productCategory").addEventListener("change", (event) => {
    ui.productFilters.category = event.target.value;
    ui.productPage = 1;
    render();
  });
  document.getElementById("stockSort").addEventListener("change", (event) => {
    ui.productFilters.stock = event.target.value;
    ui.productPage = 1;
    render();
  });
  document.getElementById("alertFilter").addEventListener("change", (event) => {
    ui.productFilters.alert = event.target.value;
    ui.productPage = 1;
    render();
  });
  document.getElementById("productPrevPage")?.addEventListener("click", () => {
    ui.productPage = Math.max(1, ui.productPage - 1);
    render();
  });
  document.getElementById("productNextPage")?.addEventListener("click", () => {
    ui.productPage += 1;
    render();
  });
  app.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", handleProductAction));
}

async function handleProductAction(event) {
  const action = event.currentTarget.dataset.action;
  const id = event.currentTarget.dataset.id;
  try {
    if (action === "add-product") openProductModal();
    if (action === "edit-product") openProductModal(id);
    if (action === "delete-product") {
      if (!confirm("Delete this product?")) return;
      await api(`/api/products/${id}`, { method: "DELETE" });
      await refresh();
    }
    if (action === "toggle-fav") {
      await api(`/api/products/${id}/favourite`, { method: "PATCH" });
      await refresh();
    }
    if (action === "scan-product") scanProductCode();
  } catch (error) {
    alert(error.message);
  }
}

function openProductModal(id, scannedCode = "") {
  const isEditing = Boolean(id);
  const product = state.products.find((item) => item.id === id) || {
    code: scannedCode || `JM-${String(state.products.length + 1).padStart(4, "0")}`,
    image: "",
    categoryId: state.categories[0]?.id || "",
    name: "",
    unit: "piece",
    cost: 0,
    price: 0,
    stock: 0,
    minStock: 0,
    favourite: false
  };
  openModal(`
    <h3>${id ? "Edit Product" : "Add Product"}</h3>
    <form id="productForm" class="form-grid three">
      <label class="field">Product code<input name="code" value="${escapeHtml(product.code)}" required /></label>
      <label class="field">Category${categorySelect("modalCategory", product.categoryId)}</label>
      <label class="field">Product name<input name="name" value="${escapeHtml(product.name)}" required /></label>
      <label class="field">Unit<input name="unit" value="${escapeHtml(product.unit)}" required /></label>
      ${isEditing ? `<label class="field">Cost<input value="${baht.format(product.cost)}" disabled /></label>` : `<label class="field">Cost<input name="cost" type="number" min="0" step="0.01" value="${product.cost}" /></label>`}
      <label class="field">Sale price<input name="price" type="number" min="0" step="0.01" value="${product.price}" /></label>
      ${isEditing ? `<label class="field">Current stock<input value="${product.stock}" disabled /></label>` : `<label class="field">Initial stock<input name="stock" type="number" min="0" step="1" value="${product.stock}" /></label>`}
      <label class="field">Minimum stock<input name="minStock" type="number" min="0" step="1" value="${product.minStock}" /></label>
      <label class="field">Favourite<select name="favourite"><option value="false">No</option><option value="true" ${product.favourite ? "selected" : ""}>Yes</option></select></label>
      <label class="field full">Image URL<input name="image" value="${escapeHtml(product.image)}" placeholder="https://..." /></label>
      <div class="dropzone field full" id="dropzone">Drop an image here or choose a file <input name="imageFile" type="file" accept="image/*" /></div>
      <div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>
  `);
  setupImageInput();
  document.getElementById("productForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      const imageFile = form.get("imageFile");
      let image = form.get("image").trim();
      if (imageFile?.size) image = await fileToDataUrl(imageFile);
      const payload = {
        code: form.get("code").trim(),
        image: image || "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=600&q=80",
        categoryId: document.getElementById("modalCategory").value,
        name: form.get("name").trim(),
        unit: form.get("unit").trim(),
        cost: id ? product.cost : Number(form.get("cost") || 0),
        price: Number(form.get("price") || 0),
        stock: id ? product.stock : Number(form.get("stock") || 0),
        minStock: Number(form.get("minStock") || 0),
        favourite: form.get("favourite") === "true"
      };
      await api(id ? `/api/products/${id}` : "/api/products", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      closeModal();
      await refresh();
    } catch (error) {
      alert(error.message);
    }
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

async function scanProductCode() {
  if (!("BarcodeDetector" in window)) {
    const code = prompt("This browser does not support direct QR scanning yet. Please enter the product code.");
    if (code) openProductModal(null, code);
    return;
  }
  openModal(`<h3>Scan QR</h3><video id="scanVideo" style="width:100%;border-radius:8px;background:#111" autoplay playsinline></video><div class="modal-actions"><button class="btn" data-close>Cancel</button></div>`);
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  const video = document.getElementById("scanVideo");
  video.srcObject = stream;
  const detector = new BarcodeDetector({ formats: ["qr_code", "ean_13", "code_128"] });
  const timer = setInterval(async () => {
    const codes = await detector.detect(video).catch(() => []);
    if (codes.length) {
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      closeModal();
      openProductModal(null, codes[0].rawValue);
    }
  }, 700);
}

function openPurchaseModal() {
  const today = new Date().toISOString().slice(0, 10);
  const emptyPurchaseItem = () => ({ productId: "", qty: "", cost: "" });
  const draft = {
    docNo: "",
    date: today,
    details: "",
    items: [emptyPurchaseItem()]
  };
  openModal(`
    <h3>Create Purchase</h3>
    <form id="purchaseForm" class="form-grid">
      <label class="field"><span>Document No.</span><input id="purchaseDocNo" name="docNo" placeholder="Enter document number" required /></label>
      <label class="field"><span>Date</span><input id="purchaseDate" name="date" type="date" value="${today}" required /></label>
      <label class="field full"><span>Details</span><textarea id="purchaseDetails" name="details" rows="3" placeholder="Enter document details"></textarea></label>
      <div class="field full">
        <div class="section-head" style="margin-bottom:12px">
          <div><h3 style="margin:0">Items</h3><p>Add one or more products with qty and unit cost.</p></div>
          <button class="btn" type="button" id="addPurchaseRow">Add Item</button>
        </div>
        <div class="list">
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th><th></th></tr></thead>
            <tbody id="purchaseItemsBody"></tbody>
          </table>
          <datalist id="purchaseProductOptions"></datalist>
        </div>
      </div>
      <div class="summary-grid field full" style="margin-top:4px">
        <div class="metric"><span>Total quantity</span><strong id="purchaseTotalQty">0</strong></div>
        <div class="metric"><span>Document total</span><strong id="purchaseGrandTotal">${baht.format(0)}</strong></div>
      </div>
      <div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save Purchase</button></div>
    </form>
  `, "modal-wide purchase-modal");

  const body = document.getElementById("purchaseItemsBody");
  const docNoInput = document.getElementById("purchaseDocNo");
  const dateInput = document.getElementById("purchaseDate");
  const detailsInput = document.getElementById("purchaseDetails");
  const totalQtyEl = document.getElementById("purchaseTotalQty");
  const grandTotalEl = document.getElementById("purchaseGrandTotal");
  const productOptionsEl = document.getElementById("purchaseProductOptions");

  function lineTotal(item) {
    return Number(item.qty || 0) * Number(item.cost || 0);
  }

  function productLabel(product) {
    return product ? `${product.name} (${product.code})` : "";
  }

  function purchaseProductOptions() {
    return state.products
      .map((product) => `<option value="${escapeHtml(productLabel(product))}" label="${escapeHtml(product.code)}"></option>`)
      .join("");
  }

  function findPurchaseProduct(value) {
    const query = String(value || "").trim().toLowerCase();
    if (!query) return null;
    const exact = state.products.find((product) =>
      productLabel(product).toLowerCase() === query ||
      product.code.toLowerCase() === query ||
      product.name.toLowerCase() === query
    );
    if (exact) return exact;
    const matches = state.products.filter((product) =>
      product.code.toLowerCase().includes(query) ||
      product.name.toLowerCase().includes(query)
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function updatePurchaseRow(index, updateCostInput = false) {
    const item = draft.items[index];
    const row = body.querySelector(`[data-purchase-row="${index}"]`);
    if (!row) return;
    if (updateCostInput) row.querySelector('[data-purchase-field="cost"]').value = item.cost;
    row.querySelector("[data-purchase-product-meta]").textContent = purchaseProductMeta(item.productId);
    row.querySelector("[data-purchase-line-total]").textContent = baht.format(lineTotal(item));
  }

  function purchaseProductMeta(productId) {
    const product = state.products.find((entry) => entry.id === productId);
    if (!product) return "Type product name or code, then choose from suggestions.";
    return `${product.code} • ${categoryName(product.categoryId)} • Current stock ${number.format(product.stock)} ${product.unit}`;
  }

  function syncSummary() {
    const totalQty = draft.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const totalAmount = draft.items.reduce((sum, item) => sum + lineTotal(item), 0);
    totalQtyEl.textContent = number.format(totalQty);
    grandTotalEl.textContent = baht.format(totalAmount);
  }

  function renderRows() {
    productOptionsEl.innerHTML = purchaseProductOptions();
    body.innerHTML = draft.items
      .map(
        (item, index) => `
          <tr data-purchase-row="${index}">
            <td>
              <div class="purchase-product-picker">
                <input data-purchase-field="productSearch" data-index="${index}" list="purchaseProductOptions" value="${escapeHtml(productLabel(state.products.find((product) => product.id === item.productId)))}" placeholder="Search product name or code" />
                <small data-purchase-product-meta>${escapeHtml(purchaseProductMeta(item.productId))}</small>
              </div>
            </td>
            <td><input data-purchase-field="qty" data-index="${index}" type="number" min="1" step="1" value="${item.qty}" placeholder="Qty" /></td>
            <td><input data-purchase-field="cost" data-index="${index}" type="number" min="0" step="0.01" value="${item.cost}" placeholder="Unit cost" /></td>
            <td data-purchase-line-total>${baht.format(lineTotal(item))}</td>
            <td class="row-action-cell"><button class="icon-action danger" type="button" data-purchase-remove="${index}" title="Remove item" aria-label="Remove item" ${draft.items.length === 1 ? "disabled" : ""}>×</button></td>
          </tr>`
      )
      .join("");
    body.querySelectorAll("[data-purchase-field]").forEach((element) =>
      element.addEventListener("input", (event) => {
        const index = Number(event.target.dataset.index);
        const field = event.target.dataset.purchaseField;
        if (field === "productSearch") {
          const product = findPurchaseProduct(event.target.value);
          if (product) {
            draft.items[index].productId = product.id;
            draft.items[index].cost = product.cost;
            updatePurchaseRow(index, true);
          }
        } else {
          draft.items[index][field] = Number(event.target.value || 0);
          updatePurchaseRow(index);
        }
        syncSummary();
      })
    );

    body.querySelectorAll("[data-purchase-remove]").forEach((button) =>
      button.addEventListener("click", () => {
        draft.items.splice(Number(button.dataset.purchaseRemove), 1);
        renderRows();
        syncSummary();
      })
    );
  }

  document.getElementById("addPurchaseRow").addEventListener("click", () => {
    draft.items.push(emptyPurchaseItem());
    renderRows();
    syncSummary();
  });

  renderRows();
  syncSummary();

  document.getElementById("purchaseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const items = draft.items
        .map((item) => ({
          productId: item.productId,
          qty: Number(item.qty || 0),
          cost: Number(item.cost || 0)
        }))
        .filter((item) => item.productId && item.qty > 0);
      if (!items.length) return alert("Please select at least one product and enter its quantity.");
      await api("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          docNo: docNoInput.value.trim(),
          date: dateInput.value,
          details: detailsInput.value.trim(),
          items
        })
      });
      closeModal();
      await refresh();
    } catch (error) {
      alert(error.message);
    }
  });
}

function renderPurchases() {
  const activePurchases = state.purchases.filter((purchase) => purchase.status !== "cancelled");
  const totalCost = activePurchases.reduce((sum, purchase) => sum + purchase.totalCost, 0);
  return `
    <section>
      <div class="section-head">
        <div><h2>Purchases</h2><p>Create purchase documents with item details and update stock immediately after save.</p></div>
        <button class="btn primary" data-action="add-purchase">Create Purchase</button>
      </div>
      <div class="summary-grid">
        <div class="metric"><span>Documents</span><strong>${number.format(state.purchases.length)}</strong></div>
        <div class="metric"><span>Active documents</span><strong>${number.format(activePurchases.length)}</strong></div>
        <div class="metric"><span>Total purchase amount</span><strong>${baht.format(totalCost)}</strong></div>
      </div>
      <div class="panel">
        <h3>Purchases Transection</h3>
        <div class="list">
          <table>
            <thead><tr><th>Document</th><th>Date</th><th>Details</th><th>Quantity</th><th>Total Cost</th><th>Status</th><th></th></tr></thead>
            <tbody>${state.purchases.map(purchaseHistoryAdminRow).join("") || `<tr><td colspan="7"><div class="empty">No purchase documents yet</div></td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </section>`;
}

function purchaseHistoryAdminRow(purchase) {
  const cancelMeta = purchase.cancelledAt ? `<br><small>${purchase.cancelledAt.slice(0, 10)} by ${escapeHtml(purchase.cancelledBy || "-")}</small>` : "";
  return `<tr><td>${escapeHtml(purchase.docNo)}</td><td>${purchase.date.slice(0, 10)}</td><td>${escapeHtml(purchase.details || "-")}</td><td>${number.format(purchase.totalQty)}</td><td>${baht.format(purchase.totalCost)}</td><td>${purchaseStatusBadge(purchase)}${cancelMeta}</td><td class="inline-actions action-cell">${actionIcon("view-purchase", purchase.id, "i", "View purchase")}${purchase.status !== "cancelled" ? actionIcon("cancel-purchase", purchase.id, "×", "Cancel purchase", "danger") : ""}</td></tr>`;
}

function bindPurchases() {
  app.querySelector('[data-action="add-purchase"]')?.addEventListener("click", openPurchaseModal);
  app.querySelectorAll('[data-action="view-purchase"]').forEach((button) =>
    button.addEventListener("click", () => openPurchaseDetails(button.dataset.id))
  );
  app.querySelectorAll('[data-action="cancel-purchase"]').forEach((button) =>
    button.addEventListener("click", async () => {
      if (!confirm("Cancel this purchase document and reverse its stock receipt?")) return;
      try {
        await api(`/api/purchases/${button.dataset.id}/cancel`, { method: "POST" });
        await refresh();
      } catch (error) {
        alert(error.message);
      }
    })
  );
}

function openPurchaseDetails(id) {
  const purchase = state.purchases.find((item) => item.id === id);
  if (!purchase) return;
  const cancelMeta = purchase.cancelledAt ? `<p style="margin:8px 0 0;color:var(--muted)">Cancelled on ${purchase.cancelledAt.slice(0, 10)} by ${escapeHtml(purchase.cancelledBy || "-")}</p>` : "";
  openModal(`
    <h3>Purchase Details</h3>
    <div class="summary-grid" style="margin-bottom:16px">
      <div class="metric"><span>Document No.</span><strong>${escapeHtml(purchase.docNo)}</strong></div>
      <div class="metric"><span>Date</span><strong>${purchase.date.slice(0, 10)}</strong></div>
      <div class="metric"><span>Total Cost</span><strong>${baht.format(purchase.totalCost)}</strong></div>
    </div>
    <div class="panel" style="margin-bottom:16px">
      <h3>Details</h3>
      <p>${escapeHtml(purchase.details || "-")}</p>
      ${cancelMeta}
    </div>
    <div class="panel">
      <h3>Items</h3>
      <div class="list" style="margin-top:12px">
        <table>
          <thead><tr><th>Product</th><th>Unit</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th></tr></thead>
          <tbody>
            ${purchase.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.unit || "-")}</td><td>${number.format(item.qty)}</td><td>${baht.format(item.cost)}</td><td>${baht.format(item.lineTotal ?? item.qty * item.cost)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn" type="button" data-close>Close</button>
      ${purchase.status !== "cancelled" ? `<button class="btn danger" type="button" id="purchaseCancelBtn">Cancel Purchase</button>` : ""}
    </div>
  `);

  document.getElementById("purchaseCancelBtn")?.addEventListener("click", async () => {
    if (!confirm("Cancel this purchase document and reverse its stock receipt?")) return;
    try {
      await api(`/api/purchases/${purchase.id}/cancel`, { method: "POST" });
      closeModal();
      await refresh();
    } catch (error) {
      alert(error.message);
    }
  });
}

function renderSalesReport() {
  const sales = byMonth(state.sales, ui.reportMonth);
  const saleMemberIds = new Set(sales.map((sale) => sale.userId));
  if (ui.reportMember !== "all" && !saleMemberIds.has(ui.reportMember)) ui.reportMember = "all";
  const activeOnly = activeDocuments(sales);
  const daily = summarizeSalesByDate(activeOnly);
  const byMember = summarizeByMember(activeOnly);
  return reportShell("Sales Report", sales, daily, byMember, true);
}

function renderPurchaseReport() {
  const purchases = byMonth(state.purchases, ui.reportMonth);
  const daily = summarizeByDate(activeDocuments(purchases), "totalCost");
  return reportShell("Purchase Report", purchases, daily, null, false);
}

function reportShell(title, rows, daily, members, isSales) {
  const countableRows = activeDocuments(rows);
  const transactionRows = filterReportTransactions(rows, isSales);
  const amount = countableRows.reduce((sum, item) => sum + (isSales ? item.total : item.totalCost), 0);
  const profit = isSales ? countableRows.reduce((sum, item) => sum + (item.profit || item.total - (item.totalCost || 0)), 0) : 0;
  const transactionTitle = isSales ? "Sale Transection" : "Purchases Transection";
  return `
    <section>
      <div class="section-head report-head">
        <div><h2>${title}</h2><p>Review daily totals by month, including quantities and amount summaries.</p></div>
        <div class="report-actions">
          <label class="field report-field">Month<input id="reportMonth" type="month" value="${ui.reportMonth}" /></label>
          <label class="field report-field">Start date<input id="exportStart" type="date" value="${ui.exportStart}" /></label>
          <label class="field report-field">End date<input id="exportEnd" type="date" value="${ui.exportEnd}" /></label>
          <button class="btn primary report-export-btn" id="exportReport" type="button">Export to Excel</button>
        </div>
      </div>
      <div class="summary-grid report-summary-grid">
        <div class="metric"><span>Documents</span><strong>${number.format(rows.length)}</strong></div>
        <div class="metric"><span>Total amount</span><strong>${baht.format(amount)}</strong></div>
        ${isSales ? `<div class="metric"><span>Gross profit</span><strong>${baht.format(profit)}</strong></div>` : ""}
      </div>
      <div class="panel">
        <h3>Daily Summary</h3>
        <div class="list" style="margin-top:12px"><table><thead><tr><th>Date</th><th>Quantity</th><th>Amount</th>${isSales ? "<th>Cost</th><th>Profit</th>" : ""}</tr></thead><tbody>
          ${daily.map((item) => `<tr><td>${item.date}</td><td>${number.format(item.qty)}</td><td>${baht.format(item.amount)}</td>${isSales ? `<td>${baht.format(item.cost || 0)}</td><td>${baht.format(item.profit || 0)}</td>` : ""}</tr>`).join("") || `<tr><td colspan="${isSales ? 5 : 3}"><div class="empty">No data yet</div></td></tr>`}
        </tbody></table></div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="transaction-head">
          <h3>${transactionTitle}</h3>
          <div class="transaction-filters">
            ${isSales ? memberFilterSelect(rows) : ""}
            ${statusFilterSelect()}
          </div>
        </div>
        <div class="list" style="margin-top:12px"><table><thead><tr><th>Document</th><th>Date</th>${isSales ? "<th>Member</th>" : "<th>Details</th>"}<th>Quantity</th><th>Amount</th>${isSales ? "<th>Cost</th><th>Profit</th>" : ""}<th>Status</th><th></th></tr></thead><tbody>
          ${transactionRows.map((item) => reportRow(item, isSales)).join("") || `<tr><td colspan="${isSales ? 9 : 7}"><div class="empty">No data yet</div></td></tr>`}
        </tbody></table></div>
      </div>
      ${members ? `<div class="panel" style="margin-top:16px"><h3>Member Purchase Summary</h3><div class="list" style="margin-top:12px"><table><thead><tr><th>Member</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>${members.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${number.format(item.qty)}</td><td>${baht.format(item.amount)}</td></tr>`).join("") || `<tr><td colspan="3"><div class="empty">No data yet</div></td></tr>`}</tbody></table></div></div>` : ""}
    </section>`;
}

function filterReportTransactions(rows, isSales) {
  return rows.filter((item) => {
    if (isSales && ui.reportMember !== "all" && item.userId !== ui.reportMember) return false;
    if (ui.reportStatus === "active" && item.status === "cancelled") return false;
    if (ui.reportStatus === "cancelled" && item.status !== "cancelled") return false;
    return true;
  });
}

function memberFilterSelect(rows) {
  const members = Array.from(
    new Map(rows.map((sale) => [sale.userId, { id: sale.userId, name: sale.userName }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  return `
    <label class="field transaction-filter">
      Filter Member
      <select id="reportMember">
        <option value="all"${ui.reportMember === "all" ? " selected" : ""}>All members</option>
        ${members.map((member) => `<option value="${escapeHtml(member.id)}"${ui.reportMember === member.id ? " selected" : ""}>${escapeHtml(member.name)}</option>`).join("")}
      </select>
    </label>`;
}

function statusFilterSelect() {
  return `
    <label class="field transaction-filter">
      Filter Status
      <select id="reportStatus">
        <option value="all"${ui.reportStatus === "all" ? " selected" : ""}>All status</option>
        <option value="active"${ui.reportStatus === "active" ? " selected" : ""}>Active</option>
        <option value="cancelled"${ui.reportStatus === "cancelled" ? " selected" : ""}>Cancelled</option>
      </select>
    </label>`;
}

function activeDocuments(rows) {
  return rows.filter((item) => item.status !== "cancelled");
}

function saleStatusBadge(sale) {
  if (sale.status === "cancelled") return `<span class="status out">Cancelled</span>`;
  return `<span class="status good">Active</span>`;
}

function purchaseStatusBadge(purchase) {
  if (purchase.status === "cancelled") return `<span class="status out">Cancelled</span>`;
  return `<span class="status good">Active</span>`;
}

function reportRow(item, isSales) {
  const canCancel = isAdmin() && item.status !== "cancelled";
  const cancelMeta = item.cancelledAt ? `<br><small>${item.cancelledAt.slice(0, 10)} by ${escapeHtml(item.cancelledBy || "-")}</small>` : "";
  if (!isSales) {
    return `<tr><td>${escapeHtml(item.docNo)}</td><td>${item.date.slice(0, 10)}</td><td>${escapeHtml(item.details || "-")}</td><td>${number.format(item.totalQty)}</td><td>${baht.format(item.totalCost)}</td><td>${purchaseStatusBadge(item)}${cancelMeta}</td><td class="inline-actions action-cell">${actionIcon("view-purchase", item.id, "i", "View purchase")}${canCancel ? actionIcon("cancel-purchase", item.id, "×", "Cancel purchase", "danger") : ""}</td></tr>`;
  }
  return `<tr><td>${escapeHtml(item.docNo)}</td><td>${item.date.slice(0, 10)}</td><td>${escapeHtml(item.userName)}</td><td>${number.format(item.totalQty)}</td><td>${baht.format(item.total)}</td><td>${baht.format(item.totalCost || 0)}</td><td>${baht.format(item.profit || item.total - (item.totalCost || 0))}</td><td>${saleStatusBadge(item)}${cancelMeta}</td><td class="inline-actions action-cell">${actionIcon("view-sale", item.id, "i", "View sale")}${canCancel ? actionIcon("cancel-sale", item.id, "×", "Cancel sale", "danger") : ""}</td></tr>`;
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

function summarizeSalesByDate(list) {
  const map = {};
  list.forEach((sale) => {
    const date = sale.date.slice(0, 10);
    if (!map[date]) map[date] = { date, qty: 0, amount: 0, cost: 0, profit: 0 };
    map[date].qty += sale.totalQty;
    map[date].amount += sale.total;
    map[date].cost += sale.totalCost || 0;
    map[date].profit += sale.profit || sale.total - (sale.totalCost || 0);
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
    ui.reportMonth = event.target.value;
    render();
  });
  document.getElementById("exportStart").addEventListener("change", (event) => {
    ui.exportStart = event.target.value;
  });
  document.getElementById("exportEnd").addEventListener("change", (event) => {
    ui.exportEnd = event.target.value;
  });
  document.getElementById("exportReport").addEventListener("click", () => exportReport(ui.activeTab === "salesReport"));
  const reportMember = document.getElementById("reportMember");
  if (reportMember) {
    reportMember.addEventListener("change", (event) => {
      ui.reportMember = event.target.value;
      render();
    });
  }
  document.getElementById("reportStatus")?.addEventListener("change", (event) => {
    ui.reportStatus = event.target.value;
    render();
  });
  app.querySelectorAll('[data-action="view-sale"]').forEach((button) =>
    button.addEventListener("click", () => openSaleDetails(button.dataset.id))
  );
  app.querySelectorAll('[data-action="cancel-sale"]').forEach((button) =>
    button.addEventListener("click", async () => {
      if (!confirm("Cancel this sales document and restore stock/balance?")) return;
      try {
        await api(`/api/sales/${button.dataset.id}/cancel`, { method: "POST" });
        await refresh();
      } catch (error) {
        alert(error.message);
      }
    })
  );
  app.querySelectorAll('[data-action="view-purchase"]').forEach((button) =>
    button.addEventListener("click", () => openPurchaseDetails(button.dataset.id))
  );
  app.querySelectorAll('[data-action="cancel-purchase"]').forEach((button) =>
    button.addEventListener("click", async () => {
      if (!confirm("Cancel this purchase document and reverse its stock receipt?")) return;
      try {
        await api(`/api/purchases/${button.dataset.id}/cancel`, { method: "POST" });
        await refresh();
      } catch (error) {
        alert(error.message);
      }
    })
  );
}

function reportRowsInExportRange(isSales) {
  const source = isSales ? state.sales : state.purchases;
  const start = ui.exportStart || "0000-01-01";
  const end = ui.exportEnd || "9999-12-31";
  return source.filter((item) => {
    const date = item.date.slice(0, 10);
    return item.status !== "cancelled" && date >= start && date <= end;
  });
}

function exportReport(isSales) {
  const rows = reportRowsInExportRange(isSales);
  const header = isSales
    ? ["Document No", "Date", "Member", "Status", "Product", "Unit", "Qty", "Unit Price", "Line Amount", "Unit Cost", "Line Cost", "Profit"]
    : ["Document No", "Date", "Details", "Status", "Product", "Unit", "Qty", "Unit Cost", "Line Total", "Document Total"];
  const csvRows = [header];

  rows.forEach((doc) => {
    if (isSales) {
      doc.items.forEach((item) => {
        const lineAmount = item.qty * item.price;
        const lineCost = item.lineCost || 0;
        csvRows.push([
          doc.docNo,
          doc.date.slice(0, 10),
          doc.userName,
          doc.status || "active",
          item.name,
          item.unit,
          item.qty,
          item.price,
          lineAmount,
          item.cost || 0,
          lineCost,
          item.profit || lineAmount - lineCost
        ]);
      });
    } else {
      doc.items.forEach((item) => {
        csvRows.push([
          doc.docNo,
          doc.date.slice(0, 10),
          doc.details || "",
          doc.status || "active",
          item.name,
          item.unit,
          item.qty,
          item.cost,
          item.lineTotal ?? item.qty * item.cost,
          doc.totalCost
        ]);
      });
    }
  });

  const csv = "\uFEFF" + csvRows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const label = isSales ? "sales-report" : "purchase-report";
  link.href = URL.createObjectURL(blob);
  link.download = `${label}-${ui.exportStart || "start"}-to-${ui.exportEnd || "end"}.csv`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function openSaleDetails(id) {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;
  const cancelMeta = sale.cancelledAt ? `<p style="margin:8px 0 0;color:var(--muted)">Cancelled on ${sale.cancelledAt.slice(0, 10)} by ${escapeHtml(sale.cancelledBy || "-")}</p>` : "";
  openModal(`
    <h3>Sale Details</h3>
    <div class="summary-grid" style="margin-bottom:16px">
      <div class="metric"><span>Document No.</span><strong>${escapeHtml(sale.docNo)}</strong></div>
      <div class="metric"><span>Date</span><strong>${sale.date.slice(0, 10)}</strong></div>
      <div class="metric"><span>Member</span><strong>${escapeHtml(sale.userName)}</strong></div>
      <div class="metric"><span>Total Amount</span><strong>${baht.format(sale.total)}</strong></div>
      <div class="metric"><span>Cost</span><strong>${baht.format(sale.totalCost || 0)}</strong></div>
      <div class="metric"><span>Profit</span><strong>${baht.format(sale.profit || sale.total - (sale.totalCost || 0))}</strong></div>
    </div>
    <div class="panel" style="margin-bottom:16px">
      <h3>Transaction</h3>
      <p>Payment Type: ${escapeHtml(sale.paymentType || "Credit")}</p>
      ${cancelMeta}
    </div>
    <div class="panel">
      <h3>Items</h3>
      <div class="list" style="margin-top:12px">
        <table>
          <thead><tr><th>Product</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Line Total</th><th>Cost</th><th>Profit</th></tr></thead>
          <tbody>
            ${sale.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.unit || "-")}</td><td>${number.format(item.qty)}</td><td>${baht.format(item.price)}</td><td>${baht.format(item.qty * item.price)}</td><td>${baht.format(item.lineCost || 0)}</td><td>${baht.format(item.profit || item.qty * item.price - (item.lineCost || 0))}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn" type="button" data-close>Close</button>
      ${sale.status !== "cancelled" ? `<button class="btn danger" type="button" id="saleCancelBtn">Cancel Sale</button>` : ""}
    </div>
  `);

  document.getElementById("saleCancelBtn")?.addEventListener("click", async () => {
    if (!confirm("Cancel this sales document and restore stock/balance?")) return;
    try {
      await api(`/api/sales/${sale.id}/cancel`, { method: "POST" });
      closeModal();
      await refresh();
    } catch (error) {
      alert(error.message);
    }
  });
}

function renderCategories() {
  return `
    <section>
      <div class="section-head"><div><h2>Categories</h2><p>Add, edit, or remove product categories used in the POS.</p></div><button class="btn primary" data-action="add-category">Add Category</button></div>
      <div class="panel"><div class="list"><table><thead><tr><th>Category</th><th>Products</th><th></th></tr></thead><tbody>
        ${state.categories.map((category) => `<tr><td>${escapeHtml(category.name)}</td><td>${state.products.filter((product) => product.categoryId === category.id).length}</td><td class="inline-actions action-cell">${actionIcon("edit-category", category.id, "✎", "Edit category")}${actionIcon("delete-category", category.id, "×", "Delete category", "danger")}</td></tr>`).join("")}
      </tbody></table></div></div>
    </section>`;
}

function bindCategories() {
  app.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      try {
        if (button.dataset.action === "add-category") openCategoryModal();
        if (button.dataset.action === "edit-category") openCategoryModal(id);
        if (button.dataset.action === "delete-category") {
          await api(`/api/categories/${id}`, { method: "DELETE" });
          await refresh();
        }
      } catch (error) {
        alert(error.message);
      }
    })
  );
}

function openCategoryModal(id) {
  const category = state.categories.find((item) => item.id === id) || { name: "" };
  openModal(`
    <h3>${id ? "Edit Category" : "Add Category"}</h3>
    <form id="categoryForm" class="form-grid">
      <label class="field full">Category name<input name="name" value="${escapeHtml(category.name)}" required /></label>
      <div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>
  `);
  document.getElementById("categoryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const name = new FormData(event.target).get("name").trim();
      await api(id ? `/api/categories/${id}` : "/api/categories", { method: id ? "PUT" : "POST", body: JSON.stringify({ name }) });
      closeModal();
      await refresh();
    } catch (error) {
      alert(error.message);
    }
  });
}

function renderMembers() {
  return `
    <section>
      <div class="section-head"><div><h2>Members</h2><p>Manage member accounts, outstanding credit, monthly discounts, and settlement.</p></div><button class="btn primary" data-action="add-user">Add Member</button></div>
      <div class="panel"><div class="list"><table><thead><tr><th>User name</th><th>Password</th><th>Outstanding</th><th>Special discount</th><th>Net payable</th><th></th></tr></thead><tbody>
        ${state.users.map((user) => {
          const net = Math.max(0, (user.balance || 0) - (user.monthlyDiscount || 0));
          return `<tr><td>${escapeHtml(user.name)}</td><td>••••</td><td>${baht.format(user.balance || 0)}</td><td>${baht.format(user.monthlyDiscount || 0)}</td><td>${baht.format(net)}</td><td class="inline-actions action-cell">${actionIcon("edit-user", user.id, "✎", "Edit member")}${actionIcon("pay-user", user.id, "฿", "Receive payment", "warn")}${actionIcon("delete-user", user.id, "×", "Delete member", "danger")}</td></tr>`;
        }).join("")}
      </tbody></table></div></div>
    </section>`;
}

function bindMembers() {
  app.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const id = button.dataset.id;
      try {
        if (action === "add-user") openUserModal();
        if (action === "edit-user") openUserModal(id);
        if (action === "pay-user") await payUser(id);
        if (action === "delete-user") {
          if (!confirm("Delete this member?")) return;
          await api(`/api/members/${id}`, { method: "DELETE" });
          await refresh();
        }
      } catch (error) {
        alert(error.message);
      }
    })
  );
}

function openUserModal(id) {
  const user = state.users.find((item) => item.id === id) || { name: "", balance: 0, monthlyDiscount: 0 };
  openModal(`
    <h3>${id ? "Edit Member" : "Add Member"}</h3>
    <form id="userForm" class="form-grid">
      <label class="field">User name<input name="name" value="${escapeHtml(user.name)}" required /></label>
      <label class="field">Password / PIN<input name="password" placeholder="${id ? "Leave blank to keep current password" : "Required"}" ${id ? "" : "required"} /></label>
      ${id ? `<label class="field">Outstanding balance<input value="${baht.format(user.balance || 0)}" disabled /></label>` : `<label class="field">Outstanding balance<input value="${baht.format(0)}" disabled /></label>`}
      <label class="field">Monthly special discount<input name="monthlyDiscount" type="number" min="0" step="0.01" value="${user.monthlyDiscount || 0}" /></label>
      <div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>
  `);
  document.getElementById("userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      const payload = {
        name: form.get("name").trim(),
        password: form.get("password").trim(),
        monthlyDiscount: Number(form.get("monthlyDiscount") || 0)
      };
      await api(id ? `/api/members/${id}` : "/api/members", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      closeModal();
      await refresh();
    } catch (error) {
      alert(error.message);
    }
  });
}

function openAccountModal() {
  openModal(`
    <h3>Account Settings</h3>
    <form id="accountForm" class="form-grid">
      <label class="field">User name<input name="name" value="${escapeHtml(state.currentUser.name)}" required /></label>
      <label class="field">Password / PIN<input name="password" placeholder="Leave blank to keep current password" /></label>
      <div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>
  `);
  document.getElementById("accountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      await api("/api/account", {
        method: "PUT",
        body: JSON.stringify({ name: form.get("name").trim(), password: form.get("password").trim() })
      });
      closeModal();
      await refresh();
    } catch (error) {
      alert(error.message);
    }
  });
}

async function payUser(id) {
  const user = state.users.find((item) => item.id === id);
  const payable = Math.max(0, (user.balance || 0) - (user.monthlyDiscount || 0));
  if (payable <= 0) return alert(`${user.name} has no payable balance.`);
  openModal(`
    <h3>Receive Payment</h3>
    <form id="paymentForm" class="form-grid">
      <label class="field"><span>Member</span><input value="${escapeHtml(user.name)}" disabled /></label>
      <label class="field"><span>Outstanding before payment</span><input value="${baht.format(user.balance || 0)}" disabled /></label>
      <label class="field"><span>Current discount</span><input value="${baht.format(user.monthlyDiscount || 0)}" disabled /></label>
      <label class="field"><span>Net payable</span><input value="${baht.format(payable)}" disabled /></label>
      <label class="field full"><span>Payment amount</span><input name="amount" type="number" min="0.01" max="${payable}" step="0.01" value="${payable}" required /></label>
      <div class="modal-actions field full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Confirm Payment</button></div>
    </form>
  `);
  document.getElementById("paymentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const amount = Number(new FormData(event.target).get("amount") || 0);
      await api(`/api/members/${id}/settle`, { method: "POST", body: JSON.stringify({ amount }) });
      closeModal();
      await refresh();
    } catch (error) {
      alert(error.message);
    }
  });
}

function renderPos() {
  const selling = topSellingIds();
  const visibleProducts = state.products.filter((product) => product.stock > 0 && (ui.posCategory === "all" || product.categoryId === ui.posCategory));
  const featured = visibleProducts.filter((product) => product.favourite || selling.includes(product.id));
  const regular = visibleProducts.filter((product) => !featured.includes(product));
  return `
    <section>
      <div class="section-head">
        <div><h2>POS</h2><p>Select products and save each checkout as credit for later settlement.</p></div>
        <div class="metric" style="min-width:220px"><span>Outstanding</span><strong>${baht.format(state.currentUser.balance || 0)}</strong></div>
      </div>
      <div class="pos-grid">
        <div>
          <div class="category-strip">
            <button class="chip ${ui.posCategory === "all" ? "active" : ""}" data-category="all">All</button>
            ${state.categories.map((category) => `<button class="chip ${ui.posCategory === category.id ? "active" : ""}" data-category="${category.id}">${escapeHtml(category.name)}</button>`).join("")}
          </div>
          ${featured.length ? `<h3>Best Sellers / Favourites</h3><div class="product-grid" style="margin:12px 0 22px">${featured.map((product) => productCard(product, selling)).join("")}</div>` : ""}
          <h3>Products</h3>
          <div class="product-grid" style="margin-top:12px">${regular.map((product) => productCard(product, selling)).join("") || `<div class="empty">No available products</div>`}</div>
        </div>
        <aside class="panel cart">
          <h3>Sales Bill</h3>
          <div class="cart-items">${cart.map(cartRow).join("") || `<div class="empty">Select products from the left</div>`}</div>
          <div class="cart-total"><span>Total</span><strong>${baht.format(cartTotal())}</strong></div>
          <button class="btn primary" style="width:100%;margin-top:14px" data-action="checkout" ${cart.length ? "" : "disabled"}>Save as Credit</button>
        </aside>
      </div>
    </section>`;
}

function renderPurchaseHistory() {
  const rows = [...state.sales].sort((a, b) => b.date.localeCompare(a.date));
  const activeRows = activeDocuments(rows);
  const totalQty = activeRows.reduce((sum, sale) => sum + sale.totalQty, 0);
  const totalAmount = activeRows.reduce((sum, sale) => sum + sale.total, 0);
  return `
    <section>
      <div class="section-head">
        <div><h2>Purchase History</h2><p>Review your saved credit purchase documents and their latest status.</p></div>
      </div>
      <div class="summary-grid">
        <div class="metric"><span>Documents</span><strong>${number.format(rows.length)}</strong></div>
        <div class="metric"><span>Active quantity</span><strong>${number.format(totalQty)}</strong></div>
        <div class="metric"><span>Active amount</span><strong>${baht.format(totalAmount)}</strong></div>
        <div class="metric"><span>Outstanding</span><strong>${baht.format(state.currentUser.balance || 0)}</strong></div>
      </div>
      <div class="panel">
        <h3>Sales Documents</h3>
        <div class="list" style="margin-top:12px"><table><thead><tr><th>Document</th><th>Date</th><th>Items</th><th>Quantity</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          ${rows.map(purchaseHistoryRow).join("") || `<tr><td colspan="6"><div class="empty">No purchase history yet</div></td></tr>`}
        </tbody></table></div>
      </div>
    </section>`;
}

function purchaseHistoryRow(sale) {
  const items = sale.items.map((item) => `${escapeHtml(item.name)} × ${number.format(item.qty)}`).join("<br>");
  const cancelMeta = sale.cancelledAt ? `<br><small>${sale.cancelledAt.slice(0, 10)} by ${escapeHtml(sale.cancelledBy || "-")}</small>` : "";
  return `<tr><td>${escapeHtml(sale.docNo)}</td><td>${sale.date.slice(0, 10)}</td><td>${items || "-"}</td><td>${number.format(sale.totalQty)}</td><td>${baht.format(sale.total)}</td><td>${saleStatusBadge(sale)}${cancelMeta}</td></tr>`;
}

function bindPurchaseHistory() {}

function productCard(product, selling) {
  return `
    <button class="product-card" data-product="${product.id}">
      <img src="${escapeHtml(product.image)}" alt="" />
      <div class="badges">${selling.includes(product.id) ? `<span class="badge" title="Best seller">↗</span>` : ""}${product.favourite ? `<span class="badge fav" title="Favourite">★</span>` : ""}</div>
      <div class="product-card-body">
        <strong>${escapeHtml(product.name)}</strong>
        <small>${escapeHtml(categoryName(product.categoryId))} • ${number.format(product.stock)} ${escapeHtml(product.unit)} left</small>
        <strong>${baht.format(product.price)}</strong>
      </div>
    </button>`;
}

function cartRow(item) {
  return `
    <div class="cart-row">
      <div><strong>${escapeHtml(item.name)}</strong><br><small>${baht.format(item.price)} / ${escapeHtml(item.unit)}</small></div>
      <div class="qty"><button class="icon-btn" data-action="dec" data-id="${item.productId}">−</button><strong>${item.qty}</strong><button class="icon-btn" data-action="inc" data-id="${item.productId}">+</button></div>
    </div>`;
}

function bindPos() {
  app.querySelectorAll("[data-category]").forEach((button) =>
    button.addEventListener("click", () => {
      ui.posCategory = button.dataset.category;
      render();
    })
  );
  app.querySelectorAll("[data-product]").forEach((button) => button.addEventListener("click", () => addToCart(button.dataset.product)));
  app.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "inc") addToCart(button.dataset.id);
      if (action === "dec") decrementCart(button.dataset.id);
      if (action === "checkout") checkout();
    })
  );
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

async function checkout() {
  if (!cart.length) return;
  try {
    const sale = await api("/api/sales", { method: "POST", body: JSON.stringify({ items: cart }) });
    cart = [];
    alert(`Sale ${sale.docNo} saved as Credit.`);
    await refresh();
  } catch (error) {
    alert(error.message);
  }
}

async function refresh() {
  await loadData();
  render();
}

function openModal(html, className = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "modal-backdrop";
  wrapper.innerHTML = `<div class="modal ${className}">${html}</div>`;
  document.body.appendChild(wrapper);
  wrapper.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closeModal));
  wrapper.addEventListener("click", (event) => {
    if (event.target === wrapper) closeModal();
  });
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

init();
