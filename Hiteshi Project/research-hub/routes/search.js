const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Note = require('../models/Note');

router.get('/', auth, async (req, res) => {
  const query = req.query.q;
  try {
    if (!query) {
      return res.json([]);
    }
    const notes = await Note.find({ $text: { $search: query } })
      .populate('topic', 'name')
      .populate('createdBy', 'name');
      
    res.json(notes);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;
