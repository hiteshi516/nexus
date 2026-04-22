const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isPublic: { type: Boolean, default: false },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  attachments: [{
    filename: String,
    path: String,
    mimetype: String
  }],
  currentVersion: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

NoteSchema.index({ title: 'text', content: 'text' });
module.exports = mongoose.model('Note', NoteSchema);
