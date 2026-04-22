const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Note = require('../models/Note');
const NoteVersion = require('../models/NoteVersion');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = './uploads/';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

router.get('/', auth, async (req, res) => {
  try {
    const notes = await Note.find({ createdBy: req.user.id }).sort({ updatedAt: -1 }).populate('topic', 'name').populate('createdBy', 'name');
    res.json(notes);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id).populate('topic', 'name').populate('createdBy', 'name');
    if (!note) return res.status(404).json({ msg: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

router.post('/', [auth, upload.array('attachments', 10)], async (req, res) => {
  const { title, content, topic, isPublic } = req.body;
  try {
    const attachments = req.files ? req.files.map(file => ({
      filename: file.originalname,
      path: file.filename,
      mimetype: file.mimetype
    })) : [];

    const newNote = new Note({
      title,
      content,
      topic,
      createdBy: req.user.id,
      isPublic: isPublic === 'true' || isPublic === true,
      attachments
    });

    const note = await newNote.save();
    
    const newVersion = new NoteVersion({
      noteId: note.id,
      versionNumber: 1,
      title: note.title,
      content: note.content,
      modifiedBy: req.user.id
    });
    await newVersion.save();

    res.json(note);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

router.put('/:id', [auth, upload.array('attachments', 10)], async (req, res) => {
  const { title, content, topic, isPublic } = req.body;
  try {
    let note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ msg: 'Note not found' });
    
    // Check if the current user is the owner
    if (note.createdBy.toString() !== req.user.id) {
        return res.status(403).json({ msg: 'Not authorized to edit this note' });
    }

    note.title = title || note.title;
    note.content = content || note.content;
    note.topic = topic || note.topic;
    if(isPublic !== undefined) note.isPublic = isPublic === 'true' || isPublic === true;
    note.updatedAt = Date.now();
    note.currentVersion += 1;

    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map(file => ({
        filename: file.originalname,
        path: file.filename,
        mimetype: file.mimetype
      }));
      note.attachments = [...note.attachments, ...newAttachments];
    }

    await note.save();

    const newVersion = new NoteVersion({
      noteId: note.id,
      versionNumber: note.currentVersion,
      title: note.title,
      content: note.content,
      modifiedBy: req.user.id
    });
    await newVersion.save();

    res.json(note);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

router.get('/:id/versions', auth, async (req, res) => {
  try {
    const versions = await NoteVersion.find({ noteId: req.params.id }).sort({ versionNumber: -1 }).populate('modifiedBy', 'name');
    res.json(versions);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});


// Toggle Like
router.post('/:id/like', auth, async (req, res) => {
  try {
    let note = await Note.findById(req.params.id);
    if(!note) return res.status(404).json({ msg: 'Note not found' });
    if(note.likes.includes(req.user.id)) {
      note.likes = note.likes.filter(id => id.toString() !== req.user.id);
    } else {
      note.likes.push(req.user.id);
    }
    await note.save();
    res.json(note.likes);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

// Toggle Save
router.post('/:id/save', auth, async (req, res) => {
  try {
    const User = require('../models/User');
    let user = await User.findById(req.user.id);
    if(user.savedNotes.includes(req.params.id)) {
      user.savedNotes = user.savedNotes.filter(id => id.toString() !== req.params.id);
    } else {
      user.savedNotes.push(req.params.id);
    }
    await user.save();
    res.json(user.savedNotes);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

module.exports = router;
