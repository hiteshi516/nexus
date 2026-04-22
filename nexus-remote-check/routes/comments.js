const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Comment = require('../models/Comment');

router.get('/:noteId', auth, async (req, res) => {
  try {
    const comments = await Comment.find({ noteId: req.params.noteId }).sort({ createdAt: 1 }).populate('author', 'name');
    res.json(comments);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.post('/:noteId', auth, async (req, res) => {
  const { content, sectionId } = req.body;
  try {
    const newComment = new Comment({
      noteId: req.params.noteId,
      sectionId,
      content,
      author: req.user.id
    });
    const comment = await newComment.save();
    const populatedComment = await comment.populate('author', 'name');
    res.json(populatedComment);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;
