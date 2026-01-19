import { Schema, model, Document, Types } from 'mongoose';

export enum MealType {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  DINNER = 'dinner'
}

export interface IMealBooking extends Document {
  userId: Types.ObjectId;
  date: Date; // Stored as YYYY-MM-DDT00:00:00.000Z
  mealType: MealType;
  bookedAt: Date;
  status: 'booked' | 'requested' | 'served' | 'rejected';
otp?: string;
}

const mealBookingSchema = new Schema<IMealBooking>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  mealType: { 
    type: String, 
    enum: Object.values(MealType), 
    required: true 
  },
  bookedAt: { type: Date, default: Date.now },
  status: { 
  type: String, 
  enum: ['booked', 'requested', 'served', 'rejected'], 
  default: 'booked' 
},
otp: { type: String }
}, { timestamps: true });

// Prevent duplicate bookings for same user/date/meal
mealBookingSchema.index({ userId: 1, date: 1, mealType: 1 }, { unique: true });

export default model<IMealBooking>('MealBooking', mealBookingSchema);