const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Topic = require('../models/Topic');

router.get('/', auth, async (req, res) => {
  try {
    const topics = await Topic.find({ createdBy: req.user.id }).sort({ createdAt: -1 }).populate('createdBy', 'name email');
    res.json(topics);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

router.post('/', auth, async (req, res) => {
  const { name, description } = req.body;
  try {
    const newTopic = new Topic({
      name,
      description,
      createdBy: req.user.id
    });
    const topic = await newTopic.save();
    res.json(topic);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

module.exports = router;
