const fs = require('fs');

// --- auth.js Updates ---
let authPath = './routes/auth.js';
let authCode = fs.readFileSync(authPath, 'utf8');

if (!authCode.includes('router.put(\'/profile\'')) {
  const newAuthEndpoints = `
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
`;
  authCode = authCode.replace('module.exports = router;', newAuthEndpoints + '\nmodule.exports = router;');
  
  // also update `/me` to populate savedNotes
  authCode = authCode.replace(
    'const user = await User.findById(req.user.id).select(\'-password\');',
    'const user = await User.findById(req.user.id).select(\'-password\').populate(\'savedNotes\');'
  );
  
  fs.writeFileSync(authPath, authCode);
}

// --- notes.js Updates ---
let notesPath = './routes/notes.js';
let notesCode = fs.readFileSync(notesPath, 'utf8');

if (!notesCode.includes('router.post(\'/:id/like\'')) {
  // modify post to include isPublic
  notesCode = notesCode.replace(
    'const { title, content, topic } = req.body;',
    'const { title, content, topic, isPublic } = req.body;'
  ).replace(
    'topic,\n      createdBy: req.user.id,',
    'topic,\n      createdBy: req.user.id,\n      isPublic: isPublic === \'true\' || isPublic === true,'
  );

  // modify put to include isPublic
  notesCode = notesCode.replace(
    'const { title, content, topic } = req.body;',
    'const { title, content, topic, isPublic } = req.body;'
  ).replace(
    'note.updatedAt = Date.now();',
    'if(isPublic !== undefined) note.isPublic = isPublic === \'true\' || isPublic === true;\n    note.updatedAt = Date.now();'
  );

  const newNotesEndpoints = `
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
`;
  notesCode = notesCode.replace('module.exports = router;', newNotesEndpoints + '\nmodule.exports = router;');
  fs.writeFileSync(notesPath, notesCode);
}

console.log('Backend routes updated successfully!');
