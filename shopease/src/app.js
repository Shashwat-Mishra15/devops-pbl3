const express = require('express');
const path = require('path');

const products = [
  { id: 1, name: 'Wireless Headphones', price: 2499, stock: 25 },
  { id: 2, name: 'Mechanical Keyboard', price: 3999, stock: 12 },
  { id: 3, name: 'Running Shoes', price: 1899, stock: 40 },
  { id: 4, name: 'Smart Watch', price: 5499, stock: 8 },
];

function createApp(env = process.env) {
  const app = express();
  const carts = new Map();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    if (env.SIMULATE_BAD_RELEASE === 'true') {
      return res.status(500).json({ status: 'unhealthy' });
    }
    return res.json({ status: 'ok' });
  });

  app.get('/version', (req, res) => {
    res.json({
      app: 'shopease',
      version: env.APP_VERSION || 'dev',
      color: env.DEPLOY_COLOR || 'none',
    });
  });

  app.get('/api/products', (req, res) => res.json(products));

  app.post('/api/cart/:user', (req, res) => {
    const product = products.find((p) => p.id === Number(req.body.productId));
    const quantity = Number(req.body.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'invalid product or quantity' });
    }
    if (quantity > product.stock) {
      return res.status(409).json({ error: 'insufficient stock' });
    }
    const cart = carts.get(req.params.user) || [];
    cart.push({ productId: product.id, name: product.name, quantity, price: product.price });
    carts.set(req.params.user, cart);
    return res.status(201).json({
      items: cart,
      total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    });
  });

  return app;
}

module.exports = { createApp, products };
