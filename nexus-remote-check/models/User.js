const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: String, default: '' },
  bio: { type: String, default: 'Researcher at Nexus' },
  savedNotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Note' }],
  date: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('User', UserSchema);
