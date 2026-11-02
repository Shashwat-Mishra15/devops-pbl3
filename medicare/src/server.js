const { createApp } = require('./app');

const port = process.env.PORT || 3000;
const app = createApp({
  apiToken: process.env.API_TOKEN,
  encryptionKey: process.env.ENCRYPTION_KEY,
});
app.listen(port, () => console.log(`MediCare listening on ${port}`));
