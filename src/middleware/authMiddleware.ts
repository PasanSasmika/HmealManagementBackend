import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const protect = (req: any, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded; // Contains id and role
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed' });
  }
};

export const authorize = (...roles: Role[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Role ${req.user.role} is not authorized` });
    }
    next();
  };
};