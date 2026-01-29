import { Request, Response } from 'express';
import VisitorBooking from '../models/VisitorBooking';
import MealPrice from '../models/MealPrice';
import { Role } from '../models/User';
import AuditLog from '@/models/AuditLog';

// 1. Add Visitor (Handles Multiple Meals)
export const addVisitorBooking = async (req: any, res: Response): Promise<void> => {
  try {
    const { visitorName, contactNumber, company, mealTypes, date } = req.body;
    // mealTypes is array e.g. ['breakfast', 'lunch']
    const addedBy = req.user.id;

    // 1. Get Current Prices
    const priceDoc = await MealPrice.findOne();
    if (!priceDoc) {
      res.status(400).json({ message: "Meal prices not set." });
      return;
    }

    const bookingsToInsert = [];
    let totalPrice = 0;

    // 2. Loop through selected meals
    for (const type of mealTypes) {
      let price = 0;
      if (type === 'breakfast') price = priceDoc.breakfast;
      else if (type === 'lunch') price = priceDoc.lunch;
      else if (type === 'dinner') price = priceDoc.dinner;

      totalPrice += price;

      bookingsToInsert.push({
        visitorName,
        contactNumber,
        company,
        mealType: type,
        date: new Date(date),
        price,
        status: 'booked',
        addedBy
      });
    }

    // 3. Bulk Insert
    await VisitorBooking.insertMany(bookingsToInsert);

    // ✅ 4. CREATE AUDIT LOG
    await AuditLog.create({
      action: "VISITOR_ADD",
      performedBy: addedBy,
      details: `Added Visitor: ${visitorName} (${company || 'No Company'}). Booked ${bookingsToInsert.length} meals.`,
      metadata: { 
        date, 
        meals: mealTypes, 
        totalCost: totalPrice 
      }
    });

    res.status(201).json({ success: true, message: `${bookingsToInsert.length} meals booked successfully.` });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ... (getVisitorBookings and issueVisitorMeal remain the same) ...
export const getVisitorBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.query;
    const searchDate = date ? new Date(date as string) : new Date();
    searchDate.setUTCHours(0,0,0,0);
    const nextDay = new Date(searchDate);
    nextDay.setUTCDate(searchDate.getUTCDate() + 1);

    const bookings = await VisitorBooking.find({
      date: { $gte: searchDate, $lt: nextDay }
    }).populate('addedBy', 'firstName lastName role');

    res.status(200).json({ success: true, data: bookings });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const issueVisitorMeal = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const issuerId = req.user.id; // Who clicked the "Issue" button

    // 1. Update Status
    const booking = await VisitorBooking.findByIdAndUpdate(id, { status: 'served' }, { new: true });
    
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    // ✅ 2. CREATE AUDIT LOG
    await AuditLog.create({
      action: "VISITOR_ISSUE",
      performedBy: issuerId,
      details: `Issued ${booking.mealType} to Visitor: ${booking.visitorName}`,
      metadata: { 
        price: booking.price, 
        company: booking.company,
        bookingId: booking._id 
      }
    });

    res.status(200).json({ success: true, message: "Visitor meal issued.", data: booking });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ NEW: Cancel Visitor Booking (Admin/HR Only)
export const cancelVisitorBooking = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Explicit Role Check (Double security)
    if (req.user.role !== Role.ADMIN && req.user.role !== Role.HRMANAGER) {
      res.status(403).json({ message: "Only Admin or HR can cancel visitor bookings." });
      return;
    }

    const booking = await VisitorBooking.findByIdAndDelete(id);
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    res.status(200).json({ success: true, message: "Visitor booking cancelled." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}