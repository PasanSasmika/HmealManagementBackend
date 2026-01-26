import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  action: string;       // e.g., "MEAL_CANCELLED"
  performedBy: Schema.Types.ObjectId; // Admin/Canteen ID
  targetUser: Schema.Types.ObjectId;  // Employee ID whose meal was cancelled
  details: string;      // The "Reason"
  metadata: any;        // Store the deleted booking info (Date, MealType)
}

const auditLogSchema = new Schema<IAuditLog>({
  action: { type: String, required: true },
  performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  details: { type: String, required: true },
  metadata: { type: Object } // Flexible field to store snapshot of deleted data
}, { timestamps: true });

export default model<IAuditLog>('AuditLog', auditLogSchema);