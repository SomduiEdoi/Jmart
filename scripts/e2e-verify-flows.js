const { chromium } = require("/Users/jacky/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const baseUrl = "http://127.0.0.1:3000";

function parseMoney(text) {
  const value = String(text).replace(/[^0-9.-]/g, "");
  return Number(value || 0);
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${payload.error || response.statusText}`);
  return payload;
}

async function loginApi({ role, userId, password }) {
  return api("/api/login", {
    method: "POST",
    body: JSON.stringify({ role, userId, password })
  });
}

async function bootstrap(token) {
  return api("/api/bootstrap", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function createSale(token, items) {
  return api("/api/sales", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items })
  });
}

async function createPurchase(token, body) {
  return api("/api/purchases", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

async function getMemberState(adminToken, memberId) {
  const data = await bootstrap(adminToken);
  const member = data.users.find((item) => item.id === memberId);
  if (!member) throw new Error(`Member ${memberId} not found`);
  return member;
}

async function getProductState(adminToken, productId) {
  const data = await bootstrap(adminToken);
  const product = data.products.find((item) => item.id === productId);
  if (!product) throw new Error(`Product ${productId} not found`);
  return product;
}

async function loginAdminUi(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#loginRole").selectOption("admin");
  await page.locator("#loginPassword").fill("admin123");
  await page.locator("#loginForm").getByRole("button", { name: "Sign In" }).click();
  await page.getByRole("tab", { name: "Products" }).waitFor({ state: "visible" }).catch(() => {});
  await page.locator("button.tab", { hasText: "Products" }).waitFor();
}

async function openTab(page, label) {
  await page.locator("button.tab", { hasText: label }).click();
}

function rowByDoc(page, docNo) {
  return page.locator("tr", { hasText: docNo }).first();
}

function rowByMember(page, memberName) {
  return page.locator("tr", { hasText: memberName }).first();
}

async function getMemberRowValues(page, memberName) {
  const row = await rowByMember(page, memberName);
  const cells = row.locator("td");
  return {
    outstanding: parseMoney(await cells.nth(2).innerText()),
    discount: parseMoney(await cells.nth(3).innerText()),
    net: parseMoney(await cells.nth(4).innerText())
  };
}

async function getProductRowValues(page, searchText) {
  await openTab(page, "Products");
  await page.locator("#productSearch").fill(searchText);
  await page.waitForTimeout(300);
  const row = page.locator("tbody tr").first();
  const cells = row.locator("td");
  return {
    code: await cells.nth(1).innerText(),
    name: await cells.nth(3).innerText(),
    stock: parseMoney(await cells.nth(7).innerText())
  };
}

async function main() {
  const results = {
    membersPayment: {},
    productsPagination: {},
    salesFlow: {},
    purchasesFlow: {}
  };

  const adminLogin = await loginApi({ role: "admin", password: "admin123" });
  const memberLogin = await loginApi({ role: "member", userId: "u-001", password: "1111" });
  const memberBefore = await getMemberState(adminLogin.token, "u-001");
  const memberBootstrap = await bootstrap(memberLogin.token);
  const chosenProduct = memberBootstrap.products.find((item) => item.stock >= 10) || memberBootstrap.products[0];
  if (!chosenProduct) throw new Error("No product available for testing.");
  const productBefore = await getProductState(adminLogin.token, chosenProduct.id);

  const saleForCancel = await createSale(memberLogin.token, [{ productId: chosenProduct.id, qty: 2 }]);

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  try {
    await loginAdminUi(page);

    await openTab(page, "Products");
    const firstPageRows = await page.locator("tbody tr").count();
    const firstPageFirstCode = await page.locator("tbody tr").first().locator("td").nth(1).innerText();
    const pageLabel1 = await page.locator("text=Page").last().innerText();
    await page.locator("#productNextPage").click();
    await page.waitForTimeout(300);
    const secondPageFirstCode = await page.locator("tbody tr").first().locator("td").nth(1).innerText();
    const pageLabel2 = await page.locator("text=Page").last().innerText();
    results.productsPagination = {
      pass: firstPageRows === 50 && firstPageFirstCode !== secondPageFirstCode && pageLabel1 !== pageLabel2,
      firstPageRows,
      pageLabel1,
      pageLabel2
    };

    await openTab(page, "Sales Report");
    const saleRow = await rowByDoc(page, saleForCancel.docNo);
    await saleRow.locator('button[data-action="view-sale"]').click();
    const saleModalTitle = await page.locator(".modal h3").first().innerText();
    const saleItemName = await page.locator(".modal tbody tr").first().locator("td").nth(0).innerText();
    await page.locator(".modal [data-close]").click();
    const productStockAfterSaleBeforeCancel = await getProductState(adminLogin.token, chosenProduct.id);
    await openTab(page, "Sales Report");
    const saleRow2 = await rowByDoc(page, saleForCancel.docNo);
    await saleRow2.locator('button[data-action="cancel-sale"]').click();
    await page.waitForTimeout(500);
    const saleStatusText = await rowByDoc(page, saleForCancel.docNo).locator("td").nth(5).innerText();
    const productAfterSaleCancel = await getProductState(adminLogin.token, chosenProduct.id);
    const memberAfterSaleCancel = await getMemberState(adminLogin.token, "u-001");
    results.salesFlow = {
      pass:
        saleModalTitle === "Sale Details" &&
        saleItemName.length > 0 &&
        saleStatusText.includes("Cancelled") &&
        productStockAfterSaleBeforeCancel.stock === productBefore.stock - 2 &&
        productAfterSaleCancel.stock === productBefore.stock &&
        Math.abs(memberAfterSaleCancel.balance - memberBefore.balance) < 0.001,
      saleDocNo: saleForCancel.docNo,
      saleStatusText
    };

    const purchaseDocNo = `PO-E2E-${Date.now()}`;
    const purchaseForCancel = await createPurchase(adminLogin.token, {
      docNo: purchaseDocNo,
      date: new Date().toISOString().slice(0, 10),
      details: "E2E purchase verification",
      items: [{ productId: chosenProduct.id, qty: 3, cost: chosenProduct.cost }]
    });
    await page.reload({ waitUntil: "networkidle" });
    await openTab(page, "Purchases");
    const purchaseRow = await rowByDoc(page, purchaseForCancel.docNo);
    await purchaseRow.locator('button[data-action="view-purchase"]').click();
    const purchaseModalTitle = await page.locator(".modal h3").first().innerText();
    const purchaseDetailText = await page.locator(".modal .panel p").first().innerText();
    await page.locator(".modal [data-close]").click();
    const productStockAfterPurchaseBeforeCancel = await getProductState(adminLogin.token, chosenProduct.id);
    await openTab(page, "Purchases");
    const purchaseRow2 = await rowByDoc(page, purchaseForCancel.docNo);
    await purchaseRow2.locator('button[data-action="cancel-purchase"]').click();
    await page.waitForTimeout(500);
    const purchaseStatusText = await rowByDoc(page, purchaseForCancel.docNo).locator("td").nth(5).innerText();
    const productAfterPurchaseCancel = await getProductState(adminLogin.token, chosenProduct.id);
    results.purchasesFlow = {
      pass:
        purchaseModalTitle === "Purchase Details" &&
        purchaseDetailText.includes("E2E purchase verification") &&
        purchaseStatusText.includes("Cancelled") &&
        productStockAfterPurchaseBeforeCancel.stock === productBefore.stock + 3 &&
        productAfterPurchaseCancel.stock === productBefore.stock,
      purchaseDocNo: purchaseForCancel.docNo,
      purchaseStatusText
    };

    const saleForPayment = await createSale(memberLogin.token, [{ productId: chosenProduct.id, qty: 1 }]);
    await page.reload({ waitUntil: "networkidle" });
    const memberBeforePayment = await getMemberState(adminLogin.token, "u-001");
    await openTab(page, "Members");
    const beforeValues = await getMemberRowValues(page, "Somchai");
    const paymentRow = await rowByMember(page, "Somchai");
    await paymentRow.locator('button[data-action="pay-user"]').click();
    const modalNet = parseMoney(await page.locator("#paymentForm input").nth(3).inputValue());
    const paymentAmount = Math.min(10, Math.max(1, Math.floor(modalNet / 2)));
    await page.locator('#paymentForm input[name="amount"]').fill(String(paymentAmount));
    await page.locator("#paymentForm").getByRole("button", { name: "Confirm Payment" }).click();
    await page.waitForTimeout(500);
    const afterValues = await getMemberRowValues(page, "Somchai");
    const memberAfterPayment = await getMemberState(adminLogin.token, "u-001");
    results.membersPayment = {
      pass:
        beforeValues.outstanding - afterValues.outstanding === paymentAmount &&
        beforeValues.net - afterValues.net === paymentAmount &&
        Math.abs(memberBeforePayment.balance - memberAfterPayment.balance - paymentAmount) < 0.001,
      saleDocNo: saleForPayment.docNo,
      paymentAmount,
      beforeValues,
      afterValues
    };
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
