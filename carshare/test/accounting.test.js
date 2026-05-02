import assert from "node:assert/strict";
import test from "node:test";

import * as accounting from "../src/accounting.js";

const { accountReplacementObligations } = accounting;

test("negative completed interval creates an unpriced open obligation for the driver", () => {
  const result = accountReplacementObligations({
    participants: [{ id: "alice" }],
    intervals: [
      {
        id: "alice-trip-1",
        userId: "alice",
        startedAt: "2026-01-01T10:00:00.000Z",
        startLiters: 50,
        endLiters: 42,
      },
    ],
    refills: [],
  });

  assert.deepEqual(result.bookings, []);
  assert.deepEqual(result.openObligations, [
    {
      intervalId: "alice-trip-1",
      userId: "alice",
      liters: 8,
      priced: false,
      startedAt: "2026-01-01T10:00:00.000Z",
    },
  ]);
});

test("positive interval requires enough refill liters in that same interval", () => {
  assert.throws(
    () =>
      accountReplacementObligations({
        participants: [{ id: "bob" }],
        intervals: [
          {
            id: "bob-surplus-1",
            userId: "bob",
            startedAt: "2026-01-02T10:00:00.000Z",
            startLiters: 20,
            endLiters: 27,
          },
        ],
        refills: [
          {
            id: "bob-refill-too-small",
            intervalId: "bob-surplus-1",
            paidByUserId: "bob",
            liters: 6,
            pricePerLiter: 1.8,
          },
        ],
      }),
    /insufficient refill liters/i
  );
});

test("own prior obligations consume cheapest surplus refill liters first and create no booking", () => {
  const result = accountReplacementObligations({
    participants: [{ id: "alice" }],
    intervals: [
      {
        id: "alice-deficit",
        userId: "alice",
        startedAt: "2026-01-01T10:00:00.000Z",
        startLiters: 40,
        endLiters: 32,
      },
      {
        id: "alice-surplus",
        userId: "alice",
        startedAt: "2026-01-03T10:00:00.000Z",
        startLiters: 32,
        endLiters: 40,
      },
    ],
    refills: [
      {
        id: "cheap-lot",
        intervalId: "alice-surplus",
        paidByUserId: "alice",
        liters: 5,
        pricePerLiter: 1.5,
      },
      {
        id: "expensive-lot",
        intervalId: "alice-surplus",
        paidByUserId: "alice",
        liters: 5,
        pricePerLiter: 2.1,
      },
    ],
  });

  assert.deepEqual(result.bookings, []);
  assert.deepEqual(result.openObligations, []);
  assert.deepEqual(result.appliedSurplus, [
    {
      obligationIntervalId: "alice-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "cheap-lot",
      fromUserId: "alice",
      toUserId: "alice",
      liters: 5,
      pricePerLiter: 1.5,
      bookingCreated: false,
    },
    {
      obligationIntervalId: "alice-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "expensive-lot",
      fromUserId: "alice",
      toUserId: "alice",
      liters: 3,
      pricePerLiter: 2.1,
      bookingCreated: false,
    },
  ]);
});

test("after cheapest-first own fills, cross-user surplus uses remaining refill liters most-expensive-first", () => {
  const result = accountReplacementObligations({
    participants: [{ id: "alice" }, { id: "bob" }, { id: "carol" }],
    intervals: [
      {
        id: "carol-old-deficit",
        userId: "carol",
        startedAt: "2026-01-01T08:00:00.000Z",
        startLiters: 30,
        endLiters: 26,
      },
      {
        id: "bob-newer-deficit",
        userId: "bob",
        startedAt: "2026-01-01T09:00:00.000Z",
        startLiters: 30,
        endLiters: 28,
      },
      {
        id: "alice-own-deficit",
        userId: "alice",
        startedAt: "2026-01-01T10:00:00.000Z",
        startLiters: 30,
        endLiters: 27,
      },
      {
        id: "alice-surplus",
        userId: "alice",
        startedAt: "2026-01-02T10:00:00.000Z",
        startLiters: 27,
        endLiters: 36,
      },
    ],
    refills: [
      {
        id: "cheap-own-lot",
        intervalId: "alice-surplus",
        paidByUserId: "alice",
        liters: 3,
        pricePerLiter: 1,
      },
      {
        id: "mid-cross-lot",
        intervalId: "alice-surplus",
        paidByUserId: "alice",
        liters: 3,
        pricePerLiter: 2,
      },
      {
        id: "expensive-cross-lot",
        intervalId: "alice-surplus",
        paidByUserId: "alice",
        liters: 3,
        pricePerLiter: 3,
      },
    ],
  });

  assert.deepEqual(result.appliedSurplus, [
    {
      obligationIntervalId: "alice-own-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "cheap-own-lot",
      fromUserId: "alice",
      toUserId: "alice",
      liters: 3,
      pricePerLiter: 1,
      bookingCreated: false,
    },
    {
      obligationIntervalId: "carol-old-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "expensive-cross-lot",
      fromUserId: "carol",
      toUserId: "alice",
      liters: 3,
      pricePerLiter: 3,
      bookingCreated: true,
    },
    {
      obligationIntervalId: "carol-old-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "mid-cross-lot",
      fromUserId: "carol",
      toUserId: "alice",
      liters: 1,
      pricePerLiter: 2,
      bookingCreated: true,
    },
    {
      obligationIntervalId: "bob-newer-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "mid-cross-lot",
      fromUserId: "bob",
      toUserId: "alice",
      liters: 2,
      pricePerLiter: 2,
      bookingCreated: true,
    },
  ]);
  assert.deepEqual(result.bookings, [
    {
      obligationIntervalId: "carol-old-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "expensive-cross-lot",
      fromUserId: "carol",
      toUserId: "alice",
      liters: 3,
      pricePerLiter: 3,
      amount: 9,
    },
    {
      obligationIntervalId: "carol-old-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "mid-cross-lot",
      fromUserId: "carol",
      toUserId: "alice",
      liters: 1,
      pricePerLiter: 2,
      amount: 2,
    },
    {
      obligationIntervalId: "bob-newer-deficit",
      surplusIntervalId: "alice-surplus",
      refillLotId: "mid-cross-lot",
      fromUserId: "bob",
      toUserId: "alice",
      liters: 2,
      pricePerLiter: 2,
      amount: 4,
    },
  ]);
  assert.deepEqual(result.openObligations, []);
});

test("handover fuel delta fill helper splits positive and negative amountLiters symmetrically", () => {
  assert.equal(typeof accounting.createHandoverFuelDeltaFillBookings, "function");

  for (const amountLiters of [6, -6]) {
    const result = accounting.createHandoverFuelDeltaFillBookings({
      deltaId: `delta-${amountLiters}`,
      previousIntervalId: "alice-before",
      previousUserId: "alice",
      nextIntervalId: "bob-after",
      nextUserId: "bob",
      amountLiters,
      paidByUserId: "carol",
      pricePerLiter: 2,
    });

    assert.deepEqual(result.bookings, [
      {
        handoverFuelDeltaId: `delta-${amountLiters}`,
        adjacentIntervalId: "alice-before",
        share: "previous",
        fromUserId: "alice",
        toUserId: "carol",
        liters: 3,
        pricePerLiter: 2,
        amount: 6,
      },
      {
        handoverFuelDeltaId: `delta-${amountLiters}`,
        adjacentIntervalId: "bob-after",
        share: "next",
        fromUserId: "bob",
        toUserId: "carol",
        liters: 3,
        pricePerLiter: 2,
        amount: 6,
      },
    ]);
  }
});

test("handover fuel delta fill helper self-elides the payer's adjacent share", () => {
  assert.equal(typeof accounting.createHandoverFuelDeltaFillBookings, "function");

  const result = accounting.createHandoverFuelDeltaFillBookings({
    deltaId: "delta-self-elide",
    previousIntervalId: "alice-before",
    previousUserId: "alice",
    nextIntervalId: "bob-after",
    nextUserId: "bob",
    amountLiters: -4,
    paidByUserId: "alice",
    pricePerLiter: 2.5,
  });

  assert.deepEqual(result.bookings, [
    {
      handoverFuelDeltaId: "delta-self-elide",
      adjacentIntervalId: "bob-after",
      share: "next",
      fromUserId: "bob",
      toUserId: "alice",
      liters: 2,
      pricePerLiter: 2.5,
      amount: 5,
    },
  ]);
});
