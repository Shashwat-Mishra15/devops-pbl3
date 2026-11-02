const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const { encrypt, decrypt } = require('./crypto');

function maskName(name) {
  return name.replace(/\S+/g, (word) => `${word[0]}***`);
}

function tokensMatch(given, expected) {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function createApp({ apiToken, encryptionKey, audit = console.log }) {
  if (!apiToken || !encryptionKey) {
    throw new Error('API_TOKEN and ENCRYPTION_KEY must be provided');
  }
  const key = Buffer.from(encryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes of hex');
  }

  const app = express();
  const patients = new Map();
  let nextId = 1;

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60000, limit: 100, standardHeaders: true, legacyHeaders: false }));
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token || !tokensMatch(token, apiToken)) {
      audit(JSON.stringify({ event: 'auth_failed', path: req.path }));
      return res.status(401).json({ error: 'unauthorized' });
    }
    return next();
  });

  api.post('/patients', (req, res) => {
    const { name, age, diagnosis } = req.body;
    const validName = typeof name === 'string' && /^[\p{L} .'-]{2,80}$/u.test(name);
    const validAge = Number.isInteger(age) && age >= 0 && age <= 130;
    const validDiagnosis = typeof diagnosis === 'string' && diagnosis.length > 0 && diagnosis.length <= 500;
    if (!validName || !validAge || !validDiagnosis) {
      return res.status(400).json({ error: 'invalid patient data' });
    }
    const id = nextId;
    nextId += 1;
    patients.set(id, { id, name: encrypt(name, key), age, diagnosis: encrypt(diagnosis, key) });
    audit(JSON.stringify({ event: 'patient_created', id, patient: maskName(name) }));
    return res.status(201).json({ id });
  });

  api.get('/patients/:id', (req, res) => {
    const record = patients.get(Number(req.params.id));
    if (!record) {
      return res.status(404).json({ error: 'not found' });
    }
    const name = decrypt(record.name, key);
    audit(JSON.stringify({ event: 'patient_read', id: record.id, patient: maskName(name) }));
    return res.json({ id: record.id, name, age: record.age, diagnosis: decrypt(record.diagnosis, key) });
  });

  app.use('/api', api);
  app.locals.patients = patients;
  return app;
}

module.exports = { createApp, maskName };
