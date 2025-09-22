// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const authRoutes = require('./routes/authRoutes');
require('dotenv').config();
const venom = require('venom-bot');
const User = require('./module/user_module'); // <-- your schema file

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*'
  }
});

// ====== Middleware ======
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/api/', authRoutes);

// ====== Socket.io ======
io.on('connection', (socket) => {
  console.log('📡 New client connected');

  socket.on('notify', ({ phoneNumber, event }) => {
    socket.emit('reminder', {
      phoneNumber,
      message: `Reminder: ${event.name} at ${event.time}`,
      options: ['Done', 'Remind me later']
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected');
  });
});

// ====== WhatsApp Bot ======
async function startVenom() {
  try {
    const client = await venom.create({
      session: 'reminder-session',
      multidevice: true,
      headless: true,
      logQR: true
    });
    console.log('📲 WhatsApp Bot ready!');
    setInterval(() => checkAndSendReminders(client), 60 * 1000);
  } catch (err) {
    console.error('❌ WhatsApp Bot error:', err);
    console.log('🔄 Restarting venom in 5 seconds...');
    setTimeout(startVenom, 5000);
  }
}

async function checkAndSendReminders(client) {
  try {
    const users = await User.find({ 'events.status': 'incomplete' });

    for (const user of users) {
      for (const event of user.events) {
        if (event.status === 'incomplete') {
          const eventDate = new Date(event.date);
          const msg = `⏰ Reminder: "${event.name}"\n📅 ${eventDate.toLocaleString()}\n📝 ${event.description || 'No description'}\nPriority: ${event.priority || 'Normal'}`;
          try {
            await sendWhatsAppMessage(client, user.phnnumber, msg);
            console.log(`✅ Message sent to ${user.phnnumber} for "${event.name}"`);
          } catch (err) {
            console.error(`❌ Failed to send to ${user.phnnumber}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Error checking reminders:', err);
  }
}


async function sendWhatsAppMessage(client, phoneNumber, message) {
  const formatted = `91${phoneNumber}@c.us`; // change 91 to your country code
  try {
    await client.sendText(formatted, message);
    console.log(`✅ WhatsApp reminder sent to ${phoneNumber}`);
  } catch (err) {
    console.error(`❌ Failed to send to ${phoneNumber}:`, err);
  }
}

// ====== MongoDB Connection and Server Start ======
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    // Start WhatsApp bot after DB is ready
    startVenom();

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));
