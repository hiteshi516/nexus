const mongoose = require('mongoose');

const NoteVersionSchema = new mongoose.Schema({
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true },
  versionNumber: { type: Number, required: true },
  title: { type: String },
  content: { type: String },
  modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('NoteVersion', NoteVersionSchema);
