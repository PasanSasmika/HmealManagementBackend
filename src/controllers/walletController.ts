import { Request, Response } from 'express';
import MealBooking from '../models/MealBooking';
import User from '../models/User';

export const getWalletStats = async (req: any, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // 1. Calculate Meal Counts
    const successCount = await MealBooking.countDocuments({ 
      userId, 
      status: 'served' 
    });

    // "Missed" = Date passed, but status is still 'booked' (User didn't request/eat)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    const missedCount = await MealBooking.countDocuments({ 
      userId, 
      status: 'booked',
      date: { $lt: today } 
    });

    // 2. Calculate Loan Amount (Sum of balance)
    // We aggregate all bookings where balance > 0
    const loanAggregation = await MealBooking.aggregate([
      { $match: { userId: user._id, balance: { $gt: 0 } } },
      { $group: { _id: null, totalLoan: { $sum: "$balance" } } }
    ]);

    const totalLoan = loanAggregation.length > 0 ? loanAggregation[0].totalLoan : 0;

    // 3. Determine Loan Limit based on SubRole
    let loanLimit = 0;
    if (user.subRole === 'casual' || user.subRole === 'manpower') {
      loanLimit = 5000; // Example Limit: LKR 5000
    } else if (user.subRole === 'permanent') {
      loanLimit = 10000; // Example: Higher limit
    }

    res.status(200).json({
      success: true,
      data: {
        successMeals: successCount,
        missedMeals: missedCount,
        loanAmount: totalLoan,
        loanLimit: loanLimit,
        userRole: user.subRole
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};