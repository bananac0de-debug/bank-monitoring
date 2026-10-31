import { describe, expect, it } from "vitest";
import {
  binarySearchSteps,
  collectGenerator,
  linearSearchSteps,
  mergeSortSteps,
} from "./generators.js";

const records = [
  { transaction_id: 7, amount: 40 },
  { transaction_id: 2, amount: 10 },
  { transaction_id: 9, amount: 40 },
  { transaction_id: 4, amount: 25 },
];

function lastStep(generator) {
  return collectGenerator(generator).at(-1);
}

describe("search step generators", () => {
  it("finds linear targets and counts each checked record", () => {
    expect(lastStep(linearSearchSteps(records, 9))).toMatchObject({
      type: "found",
      index: 2,
      comparisons: 3,
    });
  });

  it("reports not-found for an empty linear search", () => {
    expect(lastStep(linearSearchSteps([], 4))).toMatchObject({
      type: "not-found",
      comparisons: 0,
    });
  });

  it("finds and misses binary targets with explicit pointer steps", () => {
    const sorted = [...records].sort((a, b) => a.transaction_id - b.transaction_id);
    expect(lastStep(binarySearchSteps(sorted, 7))).toMatchObject({
      type: "found",
      value: records[0],
    });
    expect(lastStep(binarySearchSteps(sorted, 100))).toMatchObject({
      type: "not-found",
      comparisons: 3,
    });
  });

  it("handles single-item binary search", () => {
    expect(lastStep(binarySearchSteps([records[0]], 7))).toMatchObject({
      type: "found",
      comparisons: 1,
    });
  });
});

describe("merge sort step generator", () => {
  it("sorts ascending/descending and preserves equal-value order", () => {
    const asc = lastStep(mergeSortSteps(records, "amount", "asc"));
    const desc = lastStep(mergeSortSteps(records, "amount", "desc"));
    expect(asc.rows.map((row) => row.amount)).toEqual([10, 25, 40, 40]);
    expect(desc.rows.map((row) => row.amount)).toEqual([40, 40, 25, 10]);
    expect(asc.rows.filter((row) => row.amount === 40).map((row) => row.transaction_id))
      .toEqual([7, 9]);
    expect(asc.stable).toBe(true);
  });

  it("returns empty and one-item inputs unchanged", () => {
    expect(lastStep(mergeSortSteps([], "amount")).rows).toEqual([]);
    expect(lastStep(mergeSortSteps([records[0]], "amount")).rows).toEqual([records[0]]);
  });
});
