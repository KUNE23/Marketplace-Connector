// Backend/tests/shopeeSync.test.js
const { syncShopeeProducts } = require('../src/services/shopeeSyncService');
const prisma = require('../src/services/shopeeSyncService').prisma; // expose prisma instance
const axios = require('axios');

jest.mock('axios');

describe('Shopee sync service', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('upserts products from Shopee response', async () => {
    const mockItems = [
      {
        item_id: 1111,
        sku: 'SKU1111',
        name: 'Produk Mock 1',
        description: 'Deskripsi mock',
        price_idr: '50000',
        stock: 10,
        category: 'MockCategory',
        images: ['https://example.com/img1.jpg'],
      },
    ];
    axios.get.mockResolvedValue({ data: mockItems });

    await syncShopeeProducts();
    const product = await prisma.product.findUnique({ where: { shopeeItemId: BigInt(1111) } });
    expect(product).not.toBeNull();
    expect(product.name).toBe('Produk Mock 1');
  });
});
