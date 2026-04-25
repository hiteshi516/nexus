const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dns = require('dns');
const dotenv = require('dotenv');

dotenv.config();

// Prefer OS DNS by default. Some networks block public DNS and break Mongo SRV lookups.
if (process.env.FORCE_PUBLIC_DNS === 'true') {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
}

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

let isConnected = false;
const connectDB = async () => {
  if (isConnected) return;
  try {
    const db = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = db.connections[0].readyState;
    console.log('MongoDB Connected (Serverless)');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message || err);
  }
};

// Ensure DB is connected before handling any API routes
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/topics', require('./routes/topics'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/search', require('./routes/search'));

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
}

module.exports = app;
