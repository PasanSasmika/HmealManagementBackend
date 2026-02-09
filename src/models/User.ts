import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum Role {
  CANTEEN = 'canteen',
  EMPLOYEE = 'employee',
  ADMIN = 'admin',
  HRMANAGER = 'hrmanager'
}

export enum SubRole {
  INTERN = 'intern',
  CASUAL = 'casual',
  PERMANENT = 'permanent',
  MANPOWER = 'manpower'
}

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  username: string;
  mobileNumber: string;
  role: Role;
  subRole?: SubRole;
  companyName?: string;
  division?: string; 
  employeeNo?: string;
  empId?: string; 
  password?: string; 
  isFirstLogin: boolean;

  loanAmount: number; 
  loanLimit: number;
  bioId?: string;
  matchPassword: (enteredPassword: string) => Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  mobileNumber: { type: String, required: true }, 
  role: { type: String, enum: Object.values(Role), required: true },
  subRole: { 
    type: String, 
    enum: Object.values(SubRole),
    required: function(this: IUser) { return this.role === Role.EMPLOYEE; } 
  },
  companyName: { type: String, default: '' },
  division: { type: String, default: '' },
  employeeNo: { type: String, default: '' },
  empId: { type: String, unique: true, sparse: true },
  password: { type: String, required: true }, 
  isFirstLogin: { type: Boolean, default: true },

  loanAmount: { type: Number, default: 0 },
  loanLimit: { type: Number, default: 0 },
  bioId: { type: String, unique: true, sparse: true },
}, { timestamps: true });


userSchema.pre('save', async function (this: IUser) {
  if (!this.isModified('password')) {
    return;
  }

  
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});


userSchema.methods.matchPassword = async function (enteredPassword: string) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

export default model<IUser>('User', userSchema);