import dotenv from 'dotenv';
dotenv.config(); 

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser'; 

// Import routes
import authRoutes from './src/routes/auth.js'
import userRoutes from './src/routes/userRoutes.js';
import kitchenRoutes from './src/routes/kitchenRoutes.js';
import shopRoutes from './src/routes/shopRoutes.js';
import notificationRoutes from './src/routes/notificationsRoutes.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser()); // Parse cookies
app.use(morgan('dev'));

// Database connection
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});
mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/kitchens', kitchenRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/notifications', notificationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    const { default: User } = await import('./src/models/User.js');

    // Check if an admin user already exists
    const adminExists = await User.findOne({ role: 'Admin' });
    if (!adminExists) {
      // Create the admin user
      const adminData = {
        username: process.env.ADMIN_USERNAME ,
        email: process.env.ADMIN_EMAIL ,
        password: process.env.ADMIN_PASSWORD, 
        role: 'Admin',
      };
 
      const adminUser = new User(adminData);
      await adminUser.save();
      console.log('Initial admin user created with username:', adminData.username);
    } else {
      console.log('Admin user already exists.');
    }
  } catch (error) {
    console.error('Error creating initial admin user:', error);
  }
});
