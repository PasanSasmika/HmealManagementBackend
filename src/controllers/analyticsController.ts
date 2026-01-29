import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import MealBooking from '../models/MealBooking';
import AuditLog from '@/models/AuditLog';

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);

    // 1. Employee Count
    const employeeCount = await User.countDocuments({ role: Role.EMPLOYEE });

    // 2. Total Outstanding Loan (Sum of all employees' debt)
    const loanAggregation = await User.aggregate([
      { $match: { role: Role.EMPLOYEE, loanAmount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$loanAmount" } } }
    ]);
    const totalLoan = loanAggregation.length > 0 ? loanAggregation[0].total : 0;

    // 3. Bookings Summary (Total All Time)
    const totalBookings = await MealBooking.countDocuments({});
    const totalCancelled = await AuditLog.countDocuments({ action: 'MEAL_CANCELLED' }); // Or check if you store cancelled status

    // 4. Wastage (Missed Meals - All Time)
    // "Missed" means status is still 'booked' but the date has passed
    const wastageCount = await MealBooking.countDocuments({
      status: 'booked',
      date: { $lt: today }
    });

    // 5. Total Revenue (Value of all served meals + active future bookings)
    const revenueAggregation = await MealBooking.aggregate([
      { $match: { status: { $in: ['served', 'booked', 'requested'] } } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } }
    ]);
    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].total : 0;

    // --- TODAY'S SPECIFIC STATS ---

    // 6. Meals Issued Today
    const issuedToday = await MealBooking.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      status: 'served'
    });

    // 7. Wastage Today (Booked for today, but strictly NOT served yet... logic depends on time)
    // A better "Wastage Today" is usually calculated at the END of the day. 
    // For real-time, we can count 'booked' meals for today that haven't been claimed yet.
    const potentialWastageToday = await MealBooking.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      status: 'booked'
    });

    res.status(200).json({
      success: true,
      data: {
        employeeCount,
        loanAmount: totalLoan,
        bookingsSummary: {
          total: totalBookings,
          cancelled: totalCancelled, // Note: Only if you track history or keep cancelled docs
          wastageAllTime: wastageCount
        },
        financials: {
          revenue: totalRevenue,
          outstandingLoans: totalLoan
        },
        today: {
          issued: issuedToday,
          potentialWastage: potentialWastageToday // Booked but not eaten yet
        }
      }
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const getEmployeeFinancialReport = async (req: Request, res: Response): Promise<void> => {
  try {
    // We use aggregation to join Users with their MealBookings
    // to calculate "Total Paid" dynamically.
    const report = await User.aggregate([
      { 
        $match: { role: 'employee' } // Only filter employees
      },
      {
        $lookup: {
          from: 'mealbookings', // Ensure this matches your MongoDB collection name (usually lowercase plural)
          localField: '_id',
          foreignField: 'userId',
          as: 'bookings'
        }
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          mobileNumber: 1,
          subRole: 1,
          loanAmount: 1, // Current Outstanding Debt
          loanLimit: 1,
          // Calculate Sum of all payments made (Meals + Loan Repayments tracked in bookings)
          totalPaidLifetime: { $sum: "$bookings.amountPaid" },
          lastActive: { $max: "$bookings.date" }
        }
      },
      { $sort: { loanAmount: -1 } } // Sort by highest debt first
    ]);

    res.status(200).json({ success: true, data: report });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const getDailyBookingReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query; // Expecting startDate and endDate

    if (!startDate || !endDate) {
      res.status(400).json({ message: "Start date and end date are required (YYYY-MM-DD)" });
      return;
    }

    // Create Date Range (00:00 start date to 23:59 end date UTC)
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    // Normalize time to cover the full days
    const rangeStart = new Date(start.setUTCHours(0,0,0,0));
    const rangeEnd = new Date(end.setUTCHours(23,59,59,999));

    // Fetch Bookings + User Details
    const bookings = await MealBooking.find({
      date: { $gte: rangeStart, $lte: rangeEnd }
    })
    .populate('userId', 'firstName lastName mobileNumber subRole companyName')
    .sort({ date: -1, mealType: 1 }); // Sort by date descending

    // ✅ THIS IS THE MISSING PART: Transform data for the frontend
    const reportData = bookings.map((b: any) => ({
      bookingId: b._id,
      name: b.userId ? `${b.userId.firstName} ${b.userId.lastName}` : "Unknown User",
      mobile: b.userId?.mobileNumber || "N/A",
      type: b.userId?.subRole || "Unknown",
      
      // Show Company if manpower, otherwise Internal
      company: b.userId?.subRole === 'manpower' ? (b.userId?.companyName || 'Unknown Agency') : 'Internal',
      
      meal: b.mealType,
      status: b.status,
      time: b.bookedAt
    }));

    // Now 'reportData' exists and can be sent
    res.status(200).json({ success: true, count: reportData.length, data: reportData });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};