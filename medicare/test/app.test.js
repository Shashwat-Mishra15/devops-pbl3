const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { createApp, maskName } = require('../src/app');

const apiToken = crypto.randomBytes(16).toString('hex');
const encryptionKey = crypto.randomBytes(32).toString('hex');
const patient = { name: 'Asha Verma', age: 41, diagnosis: 'Type 2 diabetes' };

async function withServer(run) {
  const logs = [];
  const app = createApp({ apiToken, encryptionKey, audit: (line) => logs.push(line) });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/api`, app, logs);
  } finally {
    server.close();
  }
}

const send = (url, method, body, token = apiToken) => fetch(url, {
  method,
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: body && JSON.stringify(body),
});

test('rejects requests without a valid token', () => withServer(async (base) => {
  assert.strictEqual((await fetch(`${base}/patients/1`)).status, 401);
  assert.strictEqual((await send(`${base}/patients/1`, 'GET', undefined, 'wrong')).status, 401);
}));

test('stores patient data encrypted and returns it decrypted', () => withServer(async (base, app) => {
  const { id } = await (await send(`${base}/patients`, 'POST', patient)).json();
  const stored = app.locals.patients.get(id);
  assert.ok(!stored.name.includes('Asha'));
  assert.ok(!stored.diagnosis.includes('diabetes'));
  const read = await (await send(`${base}/patients/${id}`, 'GET')).json();
  assert.strictEqual(read.name, patient.name);
  assert.strictEqual(read.diagnosis, patient.diagnosis);
}));

test('audit log never contains patient identifiers or diagnosis', () => withServer(async (base, app, logs) => {
  await send(`${base}/patients`, 'POST', patient);
  const text = logs.join('\n');
  assert.ok(text.includes('patient_created'));
  assert.ok(!text.includes('Asha'));
  assert.ok(!text.includes('diabetes'));
}));

test('rejects invalid patient data', () => withServer(async (base) => {
  const res = await send(`${base}/patients`, 'POST', { name: '<script>', age: 500, diagnosis: '' });
  assert.strictEqual(res.status, 400);
}));

test('sets security headers and disables caching on records', () => withServer(async (base) => {
  const res = await send(`${base}/patients/99`, 'GET');
  assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  assert.ok(res.headers.get('content-security-policy'));
  assert.strictEqual(res.headers.get('x-powered-by'), null);
}));

test('refuses to start without secrets', () => {
  assert.throws(() => createApp({}));
});

test('masks names', () => {
  assert.strictEqual(maskName('Asha Verma'), 'A*** V***');
});
