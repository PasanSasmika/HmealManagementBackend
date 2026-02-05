import User, { Role } from '../models/User';
import bcrypt from 'bcryptjs';

export const seedDefaultUsers = async () => {
  try {
    console.log("🔄 Checking System Users...");

    // 1. Generate Hashed Password for "1234" manually
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("1234", salt);

    // --- FIX ADMIN ---
    const admin = await User.findOne({ role: Role.ADMIN });
    if (admin) {
      // Force update existing Admin
      await User.updateOne({ _id: admin._id }, { 
        $set: { 
          password: hashedPassword, 
          isFirstLogin: false 
        } 
      });
      console.log(`✅ EXISTING ADMIN FIXED: Login with Username: '${admin.username}' | Pass: '1234'`);
    } else {
      // Create New Admin if missing
      await User.create({
        firstName: "System",
        lastName: "Admin",
        username: "admin",
        mobileNumber: "0000000000",
        role: Role.ADMIN,
        password: "1234", // Model hook will hash this
        isFirstLogin: false
      });
      console.log("✅ NEW ADMIN CREATED: Login with 'admin' | '1234'");
    }

    // --- FIX CANTEEN ---
    const canteen = await User.findOne({ role: Role.CANTEEN });
    if (canteen) {
      await User.updateOne({ _id: canteen._id }, { 
        $set: { 
          password: hashedPassword, 
          isFirstLogin: false 
        } 
      });
      console.log(`✅ EXISTING CANTEEN FIXED: Login with Username: '${canteen.username}' | Pass: '1234'`);
    } else {
        console.log("⚠️ No Canteen User found. Please create one via Admin Panel.");
    }

  } catch (error) {
    console.error("❌ Seeding Error:", error);
  }
};