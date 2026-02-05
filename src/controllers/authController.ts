import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import { registerSchema, loginSchema } from '../validations/userValidation';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs'; // ✅ Import bcrypt

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = req.body; 

    // ✅ FIX 1: Build the check query dynamically.
    // We start by checking 'username'.
    const queryConditions: any[] = [{ username: validatedData.username }];
    
    // Only check for 'empId' if it is provided and NOT an empty string.
    if (validatedData.empId && validatedData.empId.trim() !== "") {
        queryConditions.push({ empId: validatedData.empId });
    }

    // Only check for 'mobileNumber' if provided (since it is unique in DB)
    if (validatedData.mobileNumber) {
        queryConditions.push({ mobileNumber: validatedData.mobileNumber });
    }

    // Run the query with OR operator
    const existingUser = await User.findOne({ $or: queryConditions });

    if (existingUser) {
      res.status(400).json({ message: 'User with this Username, Mobile, or EMP ID already exists' });
      return;
    }

    // ✅ FIX 2: Password Logic (Admin PIN vs Default 1234)
    let finalPassword = '1234';
    let isFirstLogin = true;

    if (validatedData.password && validatedData.password.trim() !== '') {
        finalPassword = validatedData.password;
        isFirstLogin = false; 
    }

    // ✅ FIX 3: Sanitize Data for MongoDB
    // We must convert empty strings ("") to undefined.
    // If we save "", MongoDB treats it as a value and will block the 2nd user with "" due to unique constraints.
    const newUser = new User({
      ...validatedData,
      password: finalPassword, 
      isFirstLogin: isFirstLogin,
      empId: validatedData.empId || undefined,
      employeeNo: validatedData.employeeNo || undefined,
      subRole: validatedData.subRole || undefined,
      companyName: validatedData.companyName || undefined,
    });

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });

  } catch (error: any) {
    // ✅ FIX 4: Handle MongoDB Duplicate Key Error (Code 11000)
    // This catches any unique constraint violations we might have missed above
    if (error.code === 11000) {
        // Find which field caused the duplicate
        const field = Object.keys(error.keyPattern)[0]; 
        res.status(400).json({ message: `Duplicate Entry: ${field} already exists.` });
        return;
    }
    
    res.status(400).json({ error: error.errors || error.message });
  }
};
// ✅ LOGIN (Username OR Mobile + Password/PIN)
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body; 

   
    const user = await User.findOne({ 
        $or: [
            { username: username }, 
            { mobileNumber: username } 
        ] 
    });

    if (!user) {
      res.status(401).json({ message: 'Invalid username or mobile number' });
      return;
    }

    // Check Password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

    // ✅ Check First Login (1234 reset flow for Employees)
    if ((user.role === Role.EMPLOYEE || user.role === Role.ADMIN || user.role === Role.HRMANAGER) && user.isFirstLogin) {
       res.json({
         requirePinSetup: true,
         userId: user._id,
         message: "Please set your 4-digit PIN"
       });
       return;
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '90d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        fullName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        subRole: user.subRole,
        empId: user.empId
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.errors || error.message });
  }
};

// ✅ SET PIN
export const setPin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, newPin } = req.body;

    if (!newPin || newPin.length !== 4) {
      res.status(400).json({ message: "PIN must be 4 digits" });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Update password to PIN and disable first login flag
    user.password = newPin;
    user.isFirstLogin = false;
    await user.save();

    // Generate Token immediately
    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '90d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        subRole: user.subRole
      }
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // ❌ REMOVED: const salt = await bcrypt.genSalt(10);
    // ❌ REMOVED: user.password = await bcrypt.hash("1234", salt);

    // ✅ FIX: Set Plain Text. The User Model's pre('save') hook will hash it automatically.
    user.password = "1234"; 
    user.isFirstLogin = true; 
    
    await user.save(); // -> Model triggers hashing here

    res.json({ success: true, message: `Password reset to '1234' for ${user.username}` });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const registerBulk = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'Please upload an excel file' });
      return;
    }

    // ✅ FIX 1: Generate the Hash for '1234' manually BEFORE the loop
    const salt = await bcrypt.genSalt(10);
    const defaultHashedPassword = await bcrypt.hash('1234', salt);

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const usersToInsert = [];
    const errors: any[] = [];

    for (let i = 0; i < rawData.length; i++) {
      try {
        const row = rawData[i];
        
        const processedRow = {
          ...row,
          username: row.username ? String(row.username).trim() : undefined,
          mobileNumber: row.mobileNumber ? String(row.mobileNumber).trim() : undefined,
          role: row.role ? String(row.role).toLowerCase().trim() : undefined,
          subRole: row.subRole ? String(row.subRole).toLowerCase().trim() : undefined,
          companyName: row.companyName ? String(row.companyName).trim() : undefined,
          employeeNo: row.employeeNo ? String(row.employeeNo).trim() : undefined,
          empId: row.empId ? String(row.empId).trim() : undefined,
          
          // ✅ FIX 2: Use the HASHED password, not '1234'
          password: defaultHashedPassword, 
          isFirstLogin: true
        };

        // Validate (We validate BEFORE hashing usually, but password isn't in Zod schema, so it's fine)
        const validated = registerSchema.parse(processedRow);
        
        // We need to manually add password back because Zod might strip unknown fields 
        // if 'password' isn't in your registerSchema. 
        // Ideally, ensure your registerSchema allows 'password'.
        // If your schema strips it, we explicitly add it to the object pushed to DB:
        usersToInsert.push({ ...validated, password: defaultHashedPassword });

      } catch (err: any) {
        errors.push({ 
            row: i + 2, 
            details: err.errors || err.message 
        });
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ message: 'Validation failed for some rows', errors });
      return;
    }

    // Handle Partial Insertions
    try {
        const result = await User.insertMany(usersToInsert, { ordered: false });
        res.status(201).json({ message: 'Users imported successfully', count: result.length });
    } catch (dbError: any) {
        if (dbError.name === 'MongoBulkWriteError' || dbError.code === 11000) {
            const insertedCount = dbError.insertedDocs ? dbError.insertedDocs.length : 0;
            const failedCount = dbError.writeErrors ? dbError.writeErrors.length : 0;

            if (insertedCount > 0) {
                res.status(201).json({ 
                    message: `Imported ${insertedCount} users. Skipped ${failedCount} duplicates.`, 
                    count: insertedCount 
                });
                return;
            } else {
                res.status(400).json({ message: "All users in this file already exist." });
                return;
            }
        }
        throw dbError;
    }

  } catch (error: any) {
    res.status(500).json({ message: 'Server error during import', error: error.message });
  }
};
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try { const users = await User.find().select('-password -__v').sort({ createdAt: -1 }); res.json({ success: true, data: users }); } 
  catch (error: any) { res.status(500).json({ message: error.message }); }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData.password; // Do not update password here
    delete updateData.username; 
    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }).select('-password');
    if (!updatedUser) { res.status(404).json({ message: "User not found" }); return; }
    res.json({ success: true, message: "User updated successfully", data: updatedUser });
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const requestingUserId = (req as any).user.id;
    if (requestingUserId === id) { res.status(400).json({ message: "You cannot delete your own account." }); return; }
    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) { res.status(404).json({ message: "User not found" }); return; }
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error: any) { res.status(500).json({ message: error.message }); }
};