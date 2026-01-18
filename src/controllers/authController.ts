import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import { registerSchema, loginSchema } from '../validations/userValidation';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';


const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validatedData = registerSchema.parse(req.body);

    const existingUser = await User.findOne({ 
      $or: [{ username: validatedData.username }, { mobileNumber: validatedData.mobileNumber }] 
    });

    if (existingUser) {
      res.status(400).json({ message: 'User with this username or mobile already exists' });
      return;
    }

    const newUser = new User(validatedData);
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.errors || error.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, mobileNumber } = loginSchema.parse(req.body);

    const user = await User.findOne({ username, mobileNumber });

    if (!user) {
      res.status(401).json({ message: 'Authentication failed. Invalid username or mobile number.' });
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
        subRole: user.subRole
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.errors || error.message });
  }
};

export const registerBulk = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'Please upload an excel file' });
      return;
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const usersToInsert = [];
    const errors: any[] = [];

    for (let i = 0; i < rawData.length; i++) {
      try {
        const row = rawData[i];
        
        // Normalize data: trim spaces and convert to lowercase for Enums
        const processedRow = {
          ...row,
          username: row.username?.toString().trim(),
          mobileNumber: row.mobileNumber?.toString().trim(),
          role: row.role?.toString().toLowerCase().trim(),
          subRole: row.subRole ? row.subRole.toString().toLowerCase().trim() : undefined
        };

        // Validate row
        const validated = registerSchema.parse(processedRow);
        usersToInsert.push(validated);
      } catch (err: any) {
        errors.push({ row: i + 2, details: err.errors || err.message });
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ 
        message: 'Validation failed for some rows', 
        errors 
      });
      return;
    }

    const result = await User.insertMany(usersToInsert, { ordered: false });
    res.status(201).json({ message: 'Users imported', count: result.length });

  } catch (error: any) {
    res.status(500).json({ message: 'Server error during import', error: error.message });
  }
};