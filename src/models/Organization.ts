import { Schema, model, Document } from 'mongoose';

export interface IOrganization extends Document {
  companyName: string;
  divisions: string[];
}

const organizationSchema = new Schema<IOrganization>({
  companyName: { type: String, required: true, unique: true, trim: true },
  divisions: [{ type: String, trim: true }]
}, { timestamps: true });

export default model<IOrganization>('Organization', organizationSchema);