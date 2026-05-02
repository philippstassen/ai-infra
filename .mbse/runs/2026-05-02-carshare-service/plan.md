# Plan

1. Add pure accounting tests for interval delta, surplus pricing, own-first allocation, cross-user bookings, and insufficient refill rejection.
2. Add schema to fresh init and migration for existing deployments.
3. Implement service endpoints with transactional recalculation after interval/refill/obligation edits.
4. Run carshare and runtime tests in Docker.

Boundaries:
- No runtime direct DB access.
- Service endpoints own all carshare persistence.
- Reject edits/deletes that would affect settled bookings unless explicitly safe.
