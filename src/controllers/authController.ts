import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import { registerSchema, loginSchema } from '../validations/userValidation';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs'; // ✅ Import bcrypt

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const generateEmpId = (company: string, division: string, empNo: string) => {
    if (!company || !division || !empNo) return undefined;
    const c = company.replace(/\s+/g, '').toLowerCase();
    const d = division.replace(/\s+/g, '').toLowerCase();
    const e = empNo.replace(/\s+/g, '');
    return `${c}${d}${e}`; // e.g. toyoit1123
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = req.body; 

    // ✅ AUTO-GENERATE ID (Backend Enforced)
    const autoEmpId = generateEmpId(validatedData.companyName, validatedData.division, validatedData.employeeNo);

    // Build unique check query
    const queryConditions: any[] = [{ username: validatedData.username }];
    
    // Check if ID generated successfully
    if (autoEmpId) {
        queryConditions.push({ empId: autoEmpId });
    } else if (validatedData.empId) {
        // Fallback if manual ID sent (though UI is read-only)
        queryConditions.push({ empId: validatedData.empId });
    }

    if (validatedData.mobileNumber) {
        queryConditions.push({ mobileNumber: validatedData.mobileNumber });
    }

    const existingUser = await User.findOne({ $or: queryConditions });

    if (existingUser) {
      res.status(400).json({ message: 'User with this Username, Mobile, or generated EMP ID already exists' });
      return;
    }

    let finalPassword = '1234';
    let isFirstLogin = true;

    if (validatedData.password && validatedData.password.trim() !== '') {
        finalPassword = validatedData.password;
        isFirstLogin = false; 
    }

    const newUser = new User({
      ...validatedData,
      password: finalPassword, 
      isFirstLogin: isFirstLogin,
      empId: autoEmpId || validatedData.empId || undefined, // Use Generated ID
      employeeNo: validatedData.employeeNo || undefined,
      subRole: validatedData.subRole || undefined,
      companyName: validatedData.companyName || undefined,
      division: validatedData.division || undefined,
    });

    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });

  } catch (error: any) {
    if (error.code === 11000) {
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

    const salt = await bcrypt.genSalt(10);
    const defaultHashedPassword = await bcrypt.hash('1234', salt);

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const usersToInsert = [];
    const errors: any[] = [];

    const cleanStr = (val: any) => val ? String(val).trim() : undefined;
    const cleanLower = (val: any) => val ? String(val).trim().toLowerCase() : undefined;

    for (let i = 0; i < rawData.length; i++) {
      try {
        const row = rawData[i];
        
        const companyName = cleanStr(row.companyName);
        const division = cleanStr(row.division); 
        const employeeNo = cleanStr(row.employeeNo);

        // ✅ AUTO-GENERATE ID FOR BULK
        const generatedEmpId = generateEmpId(companyName || '', division || '', employeeNo || '');

        const processedRow = {
          ...row,
          firstName: cleanStr(row.firstName),
          lastName: cleanStr(row.lastName),
          username: cleanStr(row.username),
          mobileNumber: cleanStr(row.mobileNumber),
          role: cleanLower(row.role),
          subRole: cleanLower(row.subRole),
          companyName: companyName,
          division: division,
          employeeNo: employeeNo,
          empId: generatedEmpId, // Override Excel empId with Logic
          password: defaultHashedPassword, 
          isFirstLogin: true
        };

        const validated = registerSchema.parse(processedRow);
        usersToInsert.push({ ...validated, password: defaultHashedPassword, empId: generatedEmpId });

      } catch (err: any) {
        errors.push({ row: i + 2, details: err.errors || err.message });
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ message: 'Validation failed for some rows', errors });
      return;
    }

    try {
        const result = await User.insertMany(usersToInsert, { ordered: false });
        res.status(201).json({ message: 'Users imported successfully', count: result.length });
    } catch (dbError: any) {
        if (dbError.name === 'MongoBulkWriteError' || dbError.code === 11000) {
            const insertedCount = dbError.insertedDocs ? dbError.insertedDocs.length : 0;
            const failedCount = dbError.writeErrors ? dbError.writeErrors.length : 0;
            if (insertedCount > 0) {
                res.status(201).json({ message: `Imported ${insertedCount} users. Skipped ${failedCount} duplicates.`, count: insertedCount });
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
    
    // Recalculate EMP ID if fields changed
    if (updateData.companyName && updateData.division && updateData.employeeNo) {
        updateData.empId = generateEmpId(updateData.companyName, updateData.division, updateData.employeeNo);
    }

    delete updateData.password; 
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