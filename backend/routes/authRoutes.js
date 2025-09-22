const express = require('express');
const router = express.Router();
const User = require('../module/user_module'); // make sure path is correct
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ------------------ LOGIN ------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------ REGISTER ------------------
router.post('/register', upload.single('profilePic'), async (req, res) => {
  const { username, password, confirmPassword, phnnumber, email } = req.body;
  const profilePic = req.file ? req.file.filename : null;

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      phnnumber,
      email,
      profilePic
    });

    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        profilePic: newUser.profilePic
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access denied" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
};

router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    
    const currentTime = new Date();
    const upcomingEvents = user.events
      .filter(e => new Date(e.date) >= currentTime)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
      events: upcomingEvents
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
// ------------------ ADD EVENT ------------------
// Backend route: routes/events.js or similar
router.post('/add-event', authenticate, async (req, res) => {
  const { name, date, description, status, priority } = req.body;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newEvent = {
      name,
      date, // ✅ Use the date directly (already includes time)
      description,
      status: status || 'incomplete',
      priority: priority || 'medium'
    };

    user.events.push(newEvent);
    await user.save();

    res.status(201).json({ message: 'Event added successfully', event: newEvent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ------------------ DELETE EVENT ------------------
router.delete('/delete-event/:eventId', authenticate, async (req, res) => {
  const { eventId } = req.params;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.events = user.events.filter(event => event._id.toString() !== eventId);
    await user.save();

    res.status(200).json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------ MARK EVENT AS DONE ------------------
router.put('/mark-done/:eventId', authenticate, async (req, res) => {
  const { eventId } = req.params;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const event = user.events.id(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    event.status = 'complete';
    await user.save();

    res.status(200).json({ message: 'Event marked as complete' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------ EDIT EVENT ------------------
router.put('/edit-event/:id', authenticate, async (req, res) => {
  const { name, date, description, priority, status } = req.body;

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const event = user.events.id(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // ✅ Convert IST to UTC manually
    const localDate = new Date(date); // incoming "2025-12-12T09:00"
    const utcDate = new Date(localDate.getTime() + 330 * 60000); // Add 5.5 hours

    event.name = name;
    event.date = utcDate.toISOString(); // ✅ Save correct UTC datetime
    event.description = description;
    event.priority = priority;
    event.status = status;

    await user.save();

    res.status(200).json({ message: 'Event updated successfully', event });
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
router.get('/event-stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId; 
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    const total = user.events.length;
    const completed = user.events.filter(event => event.status === 'complete').length;
    const incomplete = user.events.filter(event => event.status === 'incomplete').length;

    res.json({ total, completed, incomplete });
  } catch (err) {
    console.error('Error fetching event stats:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
// ------------------ GET USER DETAILS (PROFILE) ------------------
router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Send only required details
    res.status(200).json({
      username: user.username,
      phnnumber: user.phnnumber,
      email: user.email,
      profilePic: user.profilePic
    });
    
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
// ------------------ UPDATE USER DETAILS ------------------
router.put('/update-profile', authenticate, upload.single('profilePic'), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { username, phnnumber, email } = req.body;
    const profilePic = req.file ? req.file.filename : user.profilePic; // Keep old pic if no new one

    // Update fields
    user.username = username || user.username;
    user.phnnumber = phnnumber || user.phnnumber;
    user.email = email || user.email;
    user.profilePic = profilePic;

    await user.save();

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        username: user.username,
        phnnumber: user.phnnumber,
        email: user.email,
        profilePic: user.profilePic
      }
    });

  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
