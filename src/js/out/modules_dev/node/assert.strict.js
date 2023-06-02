var {strict: strictBase } = import.meta.require("node:assert");
var {
  fail,
  AssertionError,
  ok,
  equal,
  notEqual,
  deepEqual,
  notDeepEqual,
  deepStrictEqual,
  notDeepStrictEqual,
  strictEqual,
  notStrictEqual,
  throws,
  rejects,
  doesNotThrow,
  doesNotReject,
  ifError,
  match,
  doesNotMatch,
  CallTracker
} = strictBase, defaultObject = {
  fail,
  AssertionError,
  ok,
  equal,
  notEqual,
  deepEqual,
  notDeepEqual,
  deepStrictEqual,
  notDeepStrictEqual,
  strictEqual,
  notStrictEqual,
  throws,
  rejects,
  doesNotThrow,
  doesNotReject,
  ifError,
  match,
  doesNotMatch,
  CallTracker,
  [Symbol.for("CommonJS")]: 0
};
export {
  throws,
  strictEqual,
  strictBase as strict,
  rejects,
  ok,
  notStrictEqual,
  notEqual,
  notDeepStrictEqual,
  notDeepEqual,
  match,
  ifError,
  fail,
  equal,
  doesNotThrow,
  doesNotReject,
  doesNotMatch,
  defaultObject as default,
  deepStrictEqual,
  deepEqual,
  CallTracker,
  AssertionError
};

//# debugId=24589A249F6A4E4D64756e2164756e21