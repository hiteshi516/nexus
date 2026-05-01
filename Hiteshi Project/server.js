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
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files from MongoDB GridFS
app.get('/api/uploads/:id', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { GridFSBucket, ObjectId } = require('mongodb');
    
    if (!mongoose.connection || !mongoose.connection.db) {
       return res.status(500).json({ msg: 'Database not connected' });
    }
    
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'attachments' });
    
    let fileId;
    try {
      fileId = new ObjectId(req.params.id);
    } catch (e) {
      // If the ID is not an ObjectId, it might be an old file, return 404
      return res.status(404).json({ msg: 'Invalid file ID or file not found' });
    }

    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ msg: 'File not found' });
    }
    
    res.set('Content-Type', files[0].contentType);
    res.set('Content-Disposition', `inline; filename="${files[0].filename}"`);
    
    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ msg: 'Error downloading file' });
  }
});

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('ERROR: MONGO_URI is not set. Please add it to .env or your environment.');
  process.exit(1);
}

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
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

// Global Error Handler so Express doesn't return an HTML error page
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    msg: err.message || 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
}

module.exports = app;
