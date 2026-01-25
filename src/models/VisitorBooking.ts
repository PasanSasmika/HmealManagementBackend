import { Schema, model, Document } from 'mongoose';

export interface IVisitorBooking extends Document {
  visitorName: string;
  contactNumber: string;
  company: string; // ✅ NEW
  mealType: 'breakfast' | 'lunch' | 'dinner';
  date: Date;
  price: number;
  status: 'booked' | 'served';
  addedBy: Schema.Types.ObjectId;
}

const visitorBookingSchema = new Schema<IVisitorBooking>({
  visitorName: { type: String, required: true },
  contactNumber: { type: String, required: true },
  company: { type: String, required: true }, // ✅ NEW
  mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
  date: { type: Date, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ['booked', 'served'], default: 'booked' },
  addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export default model<IVisitorBooking>('VisitorBooking', visitorBookingSchema);