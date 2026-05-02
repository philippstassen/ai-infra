/**
 * Pure replacement-obligation accounting contract.
 *
 * @param {object} input
 * @param {Array<{id:string}>} input.participants
 * @param {Array<{id:string,userId:string,startedAt:string,startLiters:number,endLiters:number}>} input.intervals
 * @param {Array<{id:string,intervalId:string,paidByUserId:string,liters:number,pricePerLiter:number}>} input.refills
 * @returns {{openObligations:Array, appliedSurplus:Array, bookings:Array}}
 */
export function accountReplacementObligations(_input) {
  const input = _input ?? {};
  const intervals = [...(input.intervals ?? [])]
    .filter((interval) => interval.endLiters !== undefined && interval.endLiters !== null)
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)) || String(a.id).localeCompare(String(b.id)));
  const refillsByInterval = new Map();
  for (const refill of input.refills ?? []) {
    const list = refillsByInterval.get(refill.intervalId) ?? [];
    list.push({ ...refill, remainingLiters: Number(refill.liters) });
    refillsByInterval.set(refill.intervalId, list);
  }

  const open = [];
  const appliedSurplus = [];
  const bookings = [];

  function addObligation(interval, liters) {
    open.push({
      intervalId: interval.id,
      userId: interval.userId,
      liters: round(liters, 3),
      priced: false,
      startedAt: interval.startedAt,
    });
  }

  for (const interval of intervals) {
    const delta = Number(interval.endLiters) - Number(interval.startLiters);
    if (delta < -0.000001) {
      addObligation(interval, Math.abs(delta));
      continue;
    }
    if (delta <= 0.000001) continue;

    let surplusRemaining = round(delta, 3);
    const lots = [...(refillsByInterval.get(interval.id) ?? [])];
    const totalRefillLiters = lots.reduce((sum, lot) => sum + Number(lot.remainingLiters), 0);
    if (totalRefillLiters + 0.000001 < surplusRemaining) {
      throw new Error(`insufficient refill liters for surplus interval ${interval.id}`);
    }

    surplusRemaining = applySurplus({
      open,
      lots: lots
        .filter((lot) => lot.remainingLiters > 0.000001)
        .sort((a, b) => Number(a.pricePerLiter) - Number(b.pricePerLiter) || String(a.id).localeCompare(String(b.id))),
      surplusRemaining,
      interval,
      matchesObligation: (obligation) => obligation.userId === interval.userId,
      appliedSurplus,
      bookings,
    });

    applySurplus({
      open,
      lots: lots
        .filter((lot) => lot.remainingLiters > 0.000001)
        .sort((a, b) => Number(b.pricePerLiter) - Number(a.pricePerLiter) || String(a.id).localeCompare(String(b.id))),
      surplusRemaining,
      interval,
      matchesObligation: (obligation) => obligation.userId !== interval.userId,
      appliedSurplus,
      bookings,
    });
    pruneOpen(open);
  }

  pruneOpen(open);
  return { openObligations: open, appliedSurplus, bookings };
}

export function createHandoverFuelDeltaFillBookings(input) {
  const liters = round(Math.abs(Number(input.amountLiters)) / 2, 3);
  const pricePerLiter = Number(input.pricePerLiter);
  const shares = [
    {
      adjacentIntervalId: input.previousIntervalId,
      share: "previous",
      fromUserId: input.previousUserId,
    },
    {
      adjacentIntervalId: input.nextIntervalId,
      share: "next",
      fromUserId: input.nextUserId,
    },
  ];
  const bookings = shares
    .filter((share) => share.fromUserId !== input.paidByUserId && liters > 0.000001)
    .map((share) => ({
      handoverFuelDeltaId: input.deltaId,
      adjacentIntervalId: share.adjacentIntervalId,
      share: share.share,
      fromUserId: share.fromUserId,
      toUserId: input.paidByUserId,
      liters,
      pricePerLiter,
      amount: round(liters * pricePerLiter, 2),
    }));

  return { bookings };
}

function applySurplus({ open, lots, surplusRemaining, interval, matchesObligation, appliedSurplus, bookings }) {
  for (const lot of lots) {
    while (lot.remainingLiters > 0.000001 && surplusRemaining > 0.000001) {
      const obligation = open.find((entry) => matchesObligation(entry) && entry.liters > 0.000001);
      if (!obligation) return surplusRemaining;

      const liters = round(Math.min(lot.remainingLiters, surplusRemaining, obligation.liters), 3);
      lot.remainingLiters = round(lot.remainingLiters - liters, 3);
      surplusRemaining = round(surplusRemaining - liters, 3);
      obligation.liters = round(obligation.liters - liters, 3);
      const bookingCreated = obligation.userId !== lot.paidByUserId;
      appliedSurplus.push({
        obligationIntervalId: obligation.intervalId,
        surplusIntervalId: interval.id,
        refillLotId: lot.id,
        fromUserId: obligation.userId,
        toUserId: lot.paidByUserId,
        liters,
        pricePerLiter: Number(lot.pricePerLiter),
        bookingCreated,
      });
      if (bookingCreated) {
        bookings.push({
          obligationIntervalId: obligation.intervalId,
          surplusIntervalId: interval.id,
          refillLotId: lot.id,
          fromUserId: obligation.userId,
          toUserId: lot.paidByUserId,
          liters,
          pricePerLiter: Number(lot.pricePerLiter),
          amount: round(liters * Number(lot.pricePerLiter), 2),
        });
      }
    }
  }

  return surplusRemaining;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function pruneOpen(open) {
  for (let index = open.length - 1; index >= 0; index -= 1) {
    if (open[index].liters <= 0.000001) open.splice(index, 1);
  }
}
