const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, default: null },
  googleId: { type: String, unique: true, sparse: true },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  isEmailVerified: { type: Boolean, default: false },
  emailOtp: { type: String, default: null },
  emailOtpExpiresAt: { type: Date, default: null },
  profilePic: { type: String, default: '' },
  bio: { type: String, default: 'Researcher at Nexus' },
  savedNotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Note' }],
  date: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('User', UserSchema);
