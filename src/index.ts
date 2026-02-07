// src/index.ts
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import MealRouter from './routes/mealRoutes';
import dotenv from 'dotenv';
import zkRouter from './routes/zkRoutes';
// import { seedDefaultUsers } from './utils/seed';

dotenv.config();

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // Adjust this for production
});

// --- Inject io into MealRouter ---
app.use('/api/meal', MealRouter(io));
app.use('/iclock', zkRouter(io));
// --- Socket.io Logic ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Users (Employee/Canteen) join rooms to receive private notifications
  socket.on('join', (roomName) => {
    socket.join(roomName);
    console.log(`Socket ${socket.id} joined room: ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/my_app';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    //  seedDefaultUsers();
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
  });