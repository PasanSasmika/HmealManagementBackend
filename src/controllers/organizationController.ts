import { Request, Response } from 'express';
import Organization from '../models/Organization';

// Get All
export const getOrganizations = async (req: Request, res: Response) => {
  try {
    const orgs = await Organization.find().sort({ companyName: 1 });
    res.json({ success: true, data: orgs });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Add Company
export const addCompany = async (req: Request, res: Response) => {
  try {
    const { companyName } = req.body;
    if (!companyName) return res.status(400).json({ message: "Company Name required" });

    const newOrg = new Organization({ companyName, divisions: [] });
    await newOrg.save();
    res.status(201).json({ success: true, message: "Company added", data: newOrg });
  } catch (error: any) {
    if (error.code === 11000) return res.status(400).json({ message: "Company already exists" });
    res.status(500).json({ message: error.message });
  }
};

// Delete Company
export const deleteCompany = async (req: Request, res: Response) => {
  try {
    await Organization.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Company deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Add Division
export const addDivision = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { divisionName } = req.body;
    
    if (!divisionName) return res.status(400).json({ message: "Division Name required" });

    const org = await Organization.findByIdAndUpdate(
      id, 
      { $addToSet: { divisions: divisionName } }, // Prevent duplicates
      { new: true }
    );
    res.json({ success: true, message: "Division added", data: org });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Remove Division
export const removeDivision = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { divisionName } = req.body;

    const org = await Organization.findByIdAndUpdate(
      id,
      { $pull: { divisions: divisionName } }, // Remove item
      { new: true }
    );
    res.json({ success: true, message: "Division removed", data: org });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};