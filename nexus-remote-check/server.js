const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dns = require('dns');
const dotenv = require('dotenv');

dotenv.config();

dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();

app.use(cors());
app.use(express.json());
// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('ERROR: MONGO_URI is not set. Please add it to .env or your environment.');
  process.exit(1);
}

async function startServer() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('MongoDB Connected');

    // Routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/topics', require('./routes/topics'));
    app.use('/api/notes', require('./routes/notes'));
    app.use('/api/comments', require('./routes/comments'));
    app.use('/api/search', require('./routes/search'));

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  } catch (err) {
    console.error('MongoDB connection failed:', err.message || err);
    console.error(err);
    process.exit(1);
  }
}

startServer();
