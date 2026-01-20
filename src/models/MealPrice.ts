import { Schema, model, Document } from 'mongoose';

export interface IMealPrice extends Document {
  breakfast: number;
  lunch: number;
  dinner: number;
  updatedBy: Schema.Types.ObjectId; // Track who changed the price
}

const mealPriceSchema = new Schema<IMealPrice>({
  breakfast: { type: Number, required: true, default: 0 },
  lunch: { type: Number, required: true, default: 0 },
  dinner: { type: Number, required: true, default: 0 },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default model<IMealPrice>('MealPrice', mealPriceSchema);