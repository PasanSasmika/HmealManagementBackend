import { Request, Response } from 'express';
import MealBooking from '../models/MealBooking'; // ✅ Import MealBooking
import User from '../models/User';
import AuditLog from '../models/AuditLog';

// 1. Mobile App Stats (Keep as is, this works)
export const getWalletStats = async (req: any, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const successCount = await MealBooking.countDocuments({ userId, status: 'served' });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const missedCount = await MealBooking.countDocuments({ userId, status: 'booked', date: { $lt: today } });

    // ✅ AGGREGATION: This works for Mobile, we need this for Admin too
    const loanAggregation = await MealBooking.aggregate([
      { $match: { userId: user._id, balance: { $gt: 0 } } },
      { $group: { _id: null, totalLoan: { $sum: "$balance" } } }
    ]);

    const totalLoan = loanAggregation.length > 0 ? loanAggregation[0].totalLoan : 0;

    let loanLimit = 0;
    if (user.subRole === 'casual' || user.subRole === 'manpower') loanLimit = 5000;
    else if (user.subRole === 'permanent') loanLimit = 10000;

    // Sync User Model with Real Calculation (Self-Healing)
    if (user.loanAmount !== totalLoan) {
      user.loanAmount = totalLoan;
      await user.save();
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

// 2. ✅ FIXED: Admin Get Specific Employee Wallet
// Now uses the SAME aggregation logic as the mobile app
export const getEmployeeWalletStats = async (req: any, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // ✅ FIX: Calculate Real Loan from Bookings (Ignore user.loanAmount for now)
    const loanAggregation = await MealBooking.aggregate([
      // Convert string ID to ObjectId just in case
      { $match: { userId: user._id, balance: { $gt: 0 } } }, 
      { $group: { _id: null, totalLoan: { $sum: "$balance" } } }
    ]);

    const realTotalLoan = loanAggregation.length > 0 ? loanAggregation[0].totalLoan : 0;

    // Self-Heal: Update the user profile to match reality
    if (user.loanAmount !== realTotalLoan) {
      user.loanAmount = realTotalLoan;
      await user.save();
    }

    res.status(200).json({
      success: true,
      data: {
        loanAmount: realTotalLoan, // ✅ Now sends 132.00, not 0
        loanLimit: user.loanLimit || 0
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 3. ✅ FIXED: Process Repayment
// Now distributes payment across unpaid bookings
export const processLoanRepayment = async (req: any, res: Response, io: any): Promise<void> => {
  try {
    const { userId, amount, notes } = req.body;
    const cashierId = req.user.id;

    if (!userId || !amount || amount <= 0) {
      res.status(400).json({ message: "Invalid Data." });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Employee not found." });
      return;
    }

    const paymentAmount = parseFloat(amount);

    // 1. Get all unpaid bookings (Oldest first)
    const unpaidBookings = await MealBooking.find({
      userId: user._id,
      balance: { $gt: 0 }
    }).sort({ date: 1 }); // Sort by Date Ascending (Oldest first)

    let remainingPayment = paymentAmount;
    let bookingsUpdated = 0;

    // 2. Distribute payment across bookings (Waterfall method)
    for (const booking of unpaidBookings) {
      if (remainingPayment <= 0) break;

      const debt = booking.balance || 0;
      
      if (remainingPayment >= debt) {
        // Pay off this booking completely
        booking.amountPaid = (booking.amountPaid || 0) + debt;
        booking.balance = 0;
        booking.paymentType = 'pay_now'; // Mark as paid
        remainingPayment -= debt;
      } else {
        // Partial payment on this booking
        booking.amountPaid = (booking.amountPaid || 0) + remainingPayment;
        booking.balance = debt - remainingPayment;
        remainingPayment = 0;
      }
      
      await booking.save();
      bookingsUpdated++;
    }

    // 3. Recalculate Total Loan after payment
    const loanAggregation = await MealBooking.aggregate([
      { $match: { userId: user._id, balance: { $gt: 0 } } },
      { $group: { _id: null, totalLoan: { $sum: "$balance" } } }
    ]);
    const newTotalLoan = loanAggregation.length > 0 ? loanAggregation[0].totalLoan : 0;

    // 4. Update User Profile
    const previousBalance = user.loanAmount;
    user.loanAmount = newTotalLoan;
    await user.save();

    // 5. Audit Log
    await AuditLog.create({
      action: "LOAN_REPAYMENT",
      performedBy: cashierId,
      targetUser: userId,
      details: `Manual payment: LKR ${amount}. Cleared ${bookingsUpdated} bookings. Notes: ${notes}`,
      metadata: { previousBalance, amountPaid: amount, newBalance: newTotalLoan }
    });

    // 6. Notify Mobile App
    io.to(userId).emit('wallet_updated');

    res.status(200).json({ 
      success: true, 
      message: "Payment processed & bookings updated.",
      data: { newBalance: newTotalLoan }
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};