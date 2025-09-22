const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true }, // stores date + time
  description: String,
  status: {
    type: String,
    enum: ['incomplete', 'complete'],
    default: 'incomplete'
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  }
});


const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  phnnumber: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  profilePic: { type: String },
  events: [eventSchema]
});


module.exports = mongoose.model('User', userSchema);
