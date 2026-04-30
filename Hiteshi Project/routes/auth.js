const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client();
const otpLifetimeMs = 10 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getGoogleAudienceList() {
  const audiences = [];
  if (process.env.GOOGLE_CLIENT_IDS) {
    audiences.push(...process.env.GOOGLE_CLIENT_IDS.split(',').map((id) => id.trim()).filter(Boolean));
  }
  if (process.env.GOOGLE_CLIENT_ID) {
    audiences.push(process.env.GOOGLE_CLIENT_ID.trim());
  }
  return [...new Set(audiences)];
}

function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getMailTransporter() {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_APP_PASSWORD) return null;

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL.trim(),
      pass: process.env.SMTP_APP_PASSWORD.trim()
    }
  });
}

function isEmailVerificationRequired() {
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'false') return false;
  return !!getMailTransporter();
}

async function sendOtpEmail(email, name, otp) {
  const transporter = getMailTransporter();
  if (!transporter) {
    throw new Error('SMTP is not configured. Add SMTP_EMAIL and SMTP_APP_PASSWORD to .env');
  }

  await transporter.sendMail({
    from: `"Nexus" <${process.env.SMTP_EMAIL}>`,
    to: email,
    subject: 'Verify your Nexus account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
        <h2 style="margin-bottom: 12px;">Verify your email</h2>
        <p style="font-size: 15px; line-height: 1.6;">Hi ${name || 'there'},</p>
        <p style="font-size: 15px; line-height: 1.6;">Use the OTP below to verify your Nexus account. This code will expire in 10 minutes.</p>
        <div style="margin: 24px 0; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; background: #f5f5f5; padding: 18px; border-radius: 12px;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #555;">If you did not create this account, you can ignore this email.</p>
      </div>
    `
  });
}

async function issueVerificationOtp(user) {
  const otp = createOtp();
  user.emailOtp = otp;
  user.emailOtpExpiresAt = new Date(Date.now() + otpLifetimeMs);
  await user.save();
  await sendOtpEmail(user.email, user.name, otp);
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profilePic: user.profilePic || '',
    authProvider: user.authProvider || 'local',
    isEmailVerified: !!user.isEmailVerified
  };
}

function sendAuthResponse(user, res) {
  const payload = { user: { id: user.id } };
  jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: 360000 }, (err, token) => {
    if (err) throw err;
    res.json({ token, user: serializeUser(user) });
  });
}

// Register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const normalizedEmail = normalizeEmail(email);
    if (!password) return res.status(400).json({ msg: 'Password is required' });
    if (!normalizedEmail) return res.status(400).json({ msg: 'Email is required' });
    if (!name || !String(name).trim()) return res.status(400).json({ msg: 'Name is required' });

    let user = await User.findOne({ email: normalizedEmail });
    if (user && user.isEmailVerified) return res.status(400).json({ msg: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (user && !user.isEmailVerified) {
      user.name = name;
      user.email = normalizedEmail;
      user.password = hashedPassword;
      user.authProvider = 'local';
      if (isEmailVerificationRequired()) {
        await issueVerificationOtp(user);
        return res.json({ msg: 'Verification OTP sent to your email', requiresOtp: true, email: user.email });
      }
      user.isEmailVerified = true;
      user.emailOtp = null;
      user.emailOtpExpiresAt = null;
      await user.save();
      return sendAuthResponse(user, res);
    }

    user = new User({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      authProvider: 'local',
      isEmailVerified: !isEmailVerificationRequired()
    });

    if (isEmailVerificationRequired()) {
      await issueVerificationOtp(user);
      return res.json({ msg: 'Verification OTP sent to your email', requiresOtp: true, email: user.email });
    }

    await user.save();
    sendAuthResponse(user, res);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  try {
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ msg: 'User not found' });
    if (!user.emailOtp || !user.emailOtpExpiresAt) return res.status(400).json({ msg: 'No active OTP found. Please request a new one.' });
    if (user.emailOtpExpiresAt.getTime() < Date.now()) return res.status(400).json({ msg: 'OTP expired. Please request a new one.' });
    if (user.emailOtp !== String(otp).trim()) return res.status(400).json({ msg: 'Invalid OTP' });

    user.isEmailVerified = true;
    user.emailOtp = null;
    user.emailOtpExpiresAt = null;
    await user.save();

    sendAuthResponse(user, res);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  try {
    if (!isEmailVerificationRequired()) {
      return res.status(400).json({ msg: 'Email verification is currently disabled' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ msg: 'User not found' });
    if (user.isEmailVerified) return res.status(400).json({ msg: 'Email is already verified' });

    await issueVerificationOtp(user);
    res.json({ msg: 'A new OTP has been sent to your email' });
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const normalizedEmail = normalizeEmail(email);
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });
    if (!user.password) {
      return res.status(400).json({ msg: 'This account uses Google sign-in. Please continue with Google.' });
    }
    if (!user.isEmailVerified && isEmailVerificationRequired()) {
      return res.status(400).json({ msg: 'Please verify your email with the OTP sent to your inbox.' });
    }
    if (!user.isEmailVerified && !isEmailVerificationRequired()) {
      user.isEmailVerified = true;
      user.emailOtp = null;
      user.emailOtpExpiresAt = null;
      await user.save();
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

    sendAuthResponse(user, res);
  } catch (err) {
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});

router.get('/google-config', (req, res) => {
  const [clientId] = getGoogleAudienceList();
  res.json({ clientId: clientId || '' });
});

router.post('/google', async (req, res) => {
  const { credential } = req.body;

  const audiences = getGoogleAudienceList();
  if (!audiences.length) {
    return res.status(500).json({ msg: 'Google sign-in is not configured' });
  }

  if (!credential) {
    return res.status(400).json({ msg: 'Google credential is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: audiences
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      return res.status(400).json({ msg: 'Unable to verify Google account' });
    }

    const normalizedEmail = normalizeEmail(payload.email);
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = new User({
        name: payload.name || payload.email.split('@')[0],
        email: normalizedEmail,
        googleId: payload.sub,
        authProvider: 'google',
        isEmailVerified: true,
        profilePic: payload.picture || ''
      });
    } else {
      user.googleId = user.googleId || payload.sub;
      user.authProvider = user.authProvider === 'local' && user.password ? 'local' : 'google';
      user.isEmailVerified = true;
      user.emailOtp = null;
      user.emailOtpExpiresAt = null;
      if (!user.profilePic && payload.picture) user.profilePic = payload.picture;
      if (!user.name && payload.name) user.name = payload.name;
    }

    await user.save();
    sendAuthResponse(user, res);
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(500).json({ msg: err.message || 'Google sign-in failed' });
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
    if (!user.password) {
      return res.status(400).json({ msg: 'Password changes are unavailable for Google-only accounts' });
    }
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
