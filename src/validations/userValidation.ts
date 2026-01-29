import { z } from 'zod';
import { Role, SubRole } from '../models/User';

export const registerSchema = z.object({
  firstName: z.string().min(2, "First name is too short"),
  lastName: z.string().min(2, "Last name is too short"),
  username: z.string().min(3, "Username must be at least 3 chars"),
  mobileNumber: z.string().regex(/^[0-9]{10}$/, "Invalid mobile number (10 digits)"),
  role: z.nativeEnum(Role),
  companyName: z.string().optional(),
  subRole: z.nativeEnum(SubRole).optional()
}).refine((data) => {
  if (data.role === Role.EMPLOYEE && !data.subRole) return false;
  return true;
}, {
  message: "Subrole is required for employees",
  path: ["subRole"]
});

export const loginSchema = z.object({
  username: z.string(),
  mobileNumber: z.string()
});