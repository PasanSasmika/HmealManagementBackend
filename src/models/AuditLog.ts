import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  action: string;
  performedBy: Types.ObjectId;
  targetUser?: Types.ObjectId; // Optional now
  details: string;
  metadata?: any;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  action: { type: String, required: true },
  
  // Who did the action (Admin/Canteen/HR)
  performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  // ✅ FIX: Set required to FALSE (or remove 'required')
  // This allows logging System Actions (like Price Updates) or Visitor Actions
  targetUser: { type: Schema.Types.ObjectId, ref: 'User', required: false },

  details: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed }, // Flexible field for any extra data
}, { timestamps: true });

export default model<IAuditLog>('AuditLog', auditLogSchema);