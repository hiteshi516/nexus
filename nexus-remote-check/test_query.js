const mongoose = require('mongoose');
const Note = require('./models/Note');
const dotenv = require('dotenv');

dotenv.config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error('ERROR: MONGO_URI is not set. Please add it to .env.');
    process.exit(1);
}

mongoose.connect(mongoUri).then(async () => {
    try {
        console.log("Connected...");
        const notes = await Note.find().sort({ updatedAt: -1 }).populate('topic', 'name').populate('createdBy', 'name');
        console.log("Notes fetched successfully: ", notes.length);
        process.exit(0);
    } catch(err) {
        console.error("Query Error:", err);
        process.exit(1);
    }
}).catch(err => {
    console.error("Connection Error:", err);
    process.exit(1);
});
