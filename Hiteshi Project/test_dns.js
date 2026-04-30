const dns = require('dns');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

console.log('Forcing public DNS...');
dns.setServers(['8.8.8.8', '8.8.4.4']);

console.log('Connecting to Mongo...');
mongoose.connect(process.env.MONGO_URI, {serverSelectionTimeoutMS: 5000})
  .then(() => {
    console.log('Connected!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
