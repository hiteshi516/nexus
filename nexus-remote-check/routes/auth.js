const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    user = new User({ name, email, password });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: 360000 }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    });
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: 360000 }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    });
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

// Get user
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').populate('savedNotes');
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});


// Update Profile
router.put('/profile', require('../middleware/auth'), async (req, res) => {
  const { name, bio, profilePic } = req.body;
  try {
    let user = await User.findById(req.user.id).select('-password');
    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (profilePic !== undefined) user.profilePic = profilePic;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

// Update Password
router.put('/password', require('../middleware/auth'), async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try {
    let user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Incorrect current password' });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.json({ msg: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

// Delete Account
router.delete('/account', require('../middleware/auth'), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.json({ msg: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

// Search Users
router.get('/users/search', require('../middleware/auth'), async (req, res) => {
  try {
    const q = req.query.q || '';
    const users = await User.find({ name: { $regex: q, $options: 'i' } }).select('-password -savedNotes');
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

// Get User Profile (Public)
router.get('/users/:id', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -savedNotes -email');
    if(!user) return res.status(404).json({ msg: 'User not found' });
    const notes = await require('../models/Note').find({ createdBy: user._id, isPublic: true }).populate('topic', 'name').populate('createdBy', 'name');
    res.json({ user, notes });
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

module.exports = router;
