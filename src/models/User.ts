import { Schema, model, Document } from 'mongoose';

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

  loanAmount: number; 
  loanLimit: number;
}

const userSchema = new Schema<IUser>({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  mobileNumber: { type: String, required: true, unique: true },
  role: { type: String, enum: Object.values(Role), required: true },
  subRole: { 
    type: String, 
    enum: Object.values(SubRole),
    required: function(this: IUser) { return this.role === Role.EMPLOYEE; } 
  },
  loanAmount: { type: Number, default: 0 },
  loanLimit: { type: Number, default: 0 }
}, { timestamps: true });

export default model<IUser>('User', userSchema);