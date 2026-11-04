// debugTest.js – quick sanity check for product & Shopee sync
const axios = require('axios');
const child_process = require('child_process');

async function main() {
  // start server as separate process
  const server = child_process.spawn('node', ['Backend/server.js'], { env: { ...process.env, PORT: '3100' }, stdio: 'inherit' });
  // give it a moment to start
  await new Promise(r => setTimeout(r, 3000));

  try {
    // login admin (seeded admin should exist)
    const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'admin@example.com',
      password: 'Password123!'
    });
    const token = loginRes.data.accessToken;
    console.log('✅ login ok');

    // manual Shopee sync (should run even if Shopee API not reachable – will error but we catch)
    try {
      const syncRes = await axios.get('http://localhost:3000/api/products/syncShopee', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('🔄 sync response:', syncRes.data);
    } catch (e) {
      console.error('⚠ sync failed (expected if no Shopee cred):', e.response?.data || e.message);
    }

    // list products (no filter)
    const listRes = await axios.get('http://localhost:3000/api/products', {
      headers: { Authorization: `Bearer ${token}` },
      params: { page: 1, limit: 5 }
    });
    console.log('📦 list products:', listRes.data);
  } catch (err) {
    console.error('❌ error during test', err.response?.data || err.message);
  } finally {
    // kill server
    server.kill();
  }
}

main();
