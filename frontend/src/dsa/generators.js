function compareValues(a, b, key, order) {
  const direction = order === "desc" ? -1 : 1;
  if (a[key] < b[key]) return -direction;
  if (a[key] > b[key]) return direction;
  return 0;
}

export function* linearSearchSteps(rows, target) {
  let comparisons = 0;
  for (let index = 0; index < rows.length; index += 1) {
    comparisons += 1;
    yield { type: "comparison", index, comparisons, value: rows[index] };
    if (String(rows[index].transaction_id) === String(target)) {
      yield { type: "found", index, comparisons, value: rows[index] };
      return;
    }
  }
  yield { type: "not-found", comparisons };
}

export function* binarySearchSteps(rows, target) {
  let low = 0;
  let high = rows.length - 1;
  let comparisons = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    comparisons += 1;
    const value = rows[mid];
    yield { type: "comparison", low, mid, high, comparisons, value };
    if (Number(value.transaction_id) === Number(target)) {
      yield { type: "found", low, mid, high, comparisons, value };
      return;
    }
    if (Number(value.transaction_id) < Number(target)) low = mid + 1;
    else high = mid - 1;
  }
  yield { type: "not-found", low, high, comparisons };
}

export function* mergeSortSteps(input, key, order = "asc") {
  let comparisons = 0;
  const rows = input.map((row, originalIndex) => ({ row, originalIndex }));

  function* sort(items, start) {
    if (items.length <= 1) return items;
    const middle = Math.floor(items.length / 2);
    yield {
      type: "split",
      start,
      middle: start + middle,
      end: start + items.length,
      values: items.map((item) => item.row),
    };
    const left = yield* sort(items.slice(0, middle), start);
    const right = yield* sort(items.slice(middle), start + middle);
    const merged = [];
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
      comparisons += 1;
      const result = compareValues(left[leftIndex].row, right[rightIndex].row, key, order);
      yield {
        type: "comparison",
        leftIndex: start + leftIndex,
        rightIndex: start + middle + rightIndex,
        left: left[leftIndex].row,
        right: right[rightIndex].row,
        comparisons,
        range: [start, start + items.length],
      };
      if (result <= 0) merged.push(left[leftIndex++]);
      else merged.push(right[rightIndex++]);
    }
    merged.push(...left.slice(leftIndex), ...right.slice(rightIndex));
    yield {
      type: "merge",
      start,
      end: start + items.length,
      values: merged.map((item) => item.row),
      comparisons,
    };
    return merged;
  }

  const sorted = yield* sort(rows, 0);
  const output = sorted.map((item) => item.row);
  yield { type: "complete", rows: output, comparisons, stable: true };
}

export function collectGenerator(generator) {
  const steps = [];
  let result = generator.next();
  while (!result.done) {
    steps.push(result.value);
    result = generator.next();
  }
  return steps;
}
