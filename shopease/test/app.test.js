const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

async function withServer(env, run) {
  const server = createApp(env).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

const addToCart = (base, body) => fetch(`${base}/api/cart/asha`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('health endpoint reports ok', () => withServer({}, async (base) => {
  assert.strictEqual((await fetch(`${base}/health`)).status, 200);
}));

test('bad release flag fails the health check', () => withServer({ SIMULATE_BAD_RELEASE: 'true' }, async (base) => {
  assert.strictEqual((await fetch(`${base}/health`)).status, 500);
}));

test('version reports build and colour', () => withServer({ APP_VERSION: '7', DEPLOY_COLOR: 'blue' }, async (base) => {
  const body = await (await fetch(`${base}/version`)).json();
  assert.strictEqual(body.version, '7');
  assert.strictEqual(body.color, 'blue');
}));

test('product catalogue is listed', () => withServer({}, async (base) => {
  const items = await (await fetch(`${base}/api/products`)).json();
  assert.ok(items.length > 0);
}));

test('cart totals line items', () => withServer({}, async (base) => {
  const res = await addToCart(base, { productId: 1, quantity: 2 });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).total, 4998);
}));

test('cart rejects invalid quantity and excess stock', () => withServer({}, async (base) => {
  assert.strictEqual((await addToCart(base, { productId: 1, quantity: 0 })).status, 400);
  assert.strictEqual((await addToCart(base, { productId: 4, quantity: 99 })).status, 409);
}));
