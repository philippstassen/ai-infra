# Ticket 001 Report

Added pure accounting tests and implemented `accountReplacementObligations` for:
- interval deficits creating unpriced obligations;
- surplus requiring same-interval refill liters;
- most-expensive-first surplus lot selection;
- own obligations before other users;
- cross-user ledger bookings.

Verification: `npm test` in Docker passed 4/4.
