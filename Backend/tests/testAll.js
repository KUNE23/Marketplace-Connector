function req(opts, body) {
  return new Promise((resolve, reject) => {
    const q = require('http').request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ s: res.statusCode, b: data }));
    });
    q.on('error', reject);
    if (body) q.write(typeof body === 'string' ? body : JSON.stringify(body));
    q.end();
  });
}

const out = [];
function log(str) { out.push(str); }

const fs = require('fs');

async function main() {
  try {
    const tr = await req(
      { hostname: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { email: 'admin@example.com', password: 'Password123!' }
    );
    const loginJson = JSON.parse(tr.b);
    const token = loginJson.accessToken;
    const userId = loginJson.user.id;
    log('LOGIN status: ' + tr.s + ' userId=' + userId);

    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    async function step(name, method, path, body = null) {
      const r = await req(
        { hostname: 'localhost', port: 3000, path, method, headers: auth },
        body
      );
      log(`[${r.s}] ${method} ${path} => ${name}`);
      try { log('RESPONSE: ' + JSON.stringify(JSON.parse(r.b)).slice(0, 500)); } catch (e) { log('RESPONSE: ' + (r.b || '').slice(0, 500)); }
      return r;
    }

    // categories
    const cr = await step('create_category', 'POST', '/api/categories', { name: 'TestCategory' });
    let cid = null;
    try { cid = JSON.parse(cr.b).id; } catch {}
    await step('list_categories', 'GET', '/api/categories');
    if (cid) {
      await step('get_category', 'GET', `/api/categories/${cid}`);
      await step('update_category', 'PATCH', `/api/categories/${cid}`, { name: 'TestCategoryUpdated' });
      await step('delete_category', 'DELETE', `/api/categories/${cid}`);
      await step('get_category_after_delete', 'GET', `/api/categories/${cid}`);
    }

    // products
    const pr = await step('create_product', 'POST', '/api/products', { sku: 'SKU_ALL', name: 'ProdAll', priceIdr: '100000', stock: 2, category: 'TestCategory', imageUrls: [] });
    let pid = null;
    try { pid = JSON.parse(pr.b).id; } catch {}
    await step('list_products', 'GET', '/api/products');
    if (pid) {
      await step('get_product', 'GET', `/api/products/${pid}`);
      await step('update_product', 'PATCH', `/api/products/${pid}`, { stock: 9 });
      await step('delete_product', 'DELETE', `/api/products/${pid}`);
      await step('get_deleted_product', 'GET', `/api/products/${pid}`);
    }

    // sales
    const saleBody = {
      shopName: 'OnlineShop',
      externalId: 'EXT' + Date.now(),
      status: 'COMPLETED',
      totalAmt: '100000',
      soldAt: new Date().toISOString(),
      items: [{ productId: pid || '1', qty: 2, unitPrice: '50000', total: '100000' }],
    };
    await step('import_sale', 'POST', '/api/sales/import', saleBody);
    await step('list_sales', 'GET', '/api/sales/orders');
    await step('recap_sales', 'GET', '/api/sales/recap');

    // notifications
    const nr = await step('create_notif', 'POST', '/api/notifications', { userId, type: 'info', title: 'Hallo', body: 'Test body' });
    let nid = null;
    try { nid = JSON.parse(nr.b).id; } catch {}
    await step('list_notifs', 'GET', '/api/notifications');
    if (nid) {
      await step('mark_notif_read', 'PATCH', `/api/notifications/${nid}/read`);
      await step('delete_notif', 'DELETE', `/api/notifications/${nid}`);
    }

    // sync (expected network error)
    await step('sync_shopee', 'GET', '/api/products/syncShopee');

    log('\n=== ALL DONE ===');
    fs.writeFileSync('test_results.txt', out.join('\n'), 'utf8');
  } catch (e) {
    log('UNCAUGHT: ' + (e && e.message ? e.message : e));
    fs.writeFileSync('test_results.txt', out.join('\n'), 'utf8');
  }
}

main();
