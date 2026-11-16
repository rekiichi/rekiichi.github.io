// 問題IDの並べ方。数字の部分は数として比べる（"w-2" < "w-10"）。
// ビルド時（問題データの分割）と出題画面（どのファイルを読むかの判定）で同じ順序を使う。

const PARTS = /(\d+)|(\D+)/g;

export function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  const pa = a.match(PARTS) ?? [];
  const pb = b.match(PARTS) ?? [];
  const len = Math.min(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === y) continue;
    const xNum = /^\d/.test(x);
    const yNum = /^\d/.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
      // "01" と "1" のように数としては等しい場合は文字列で決める
      return x < y ? -1 : 1;
    }
    return x < y ? -1 : 1;
  }
  if (pa.length !== pb.length) return pa.length - pb.length;
  return a < b ? -1 : 1;
}

/** 目録（[最初, 最後] の配列）から、ID が入っている分割ファイルの番号を探す。見つからなければ -1 */
export function findChunk(chunks: readonly (readonly [string, string])[], id: string): number {
  let lo = 0;
  let hi = chunks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [first, last] = chunks[mid];
    if (compareIds(id, first) < 0) hi = mid - 1;
    else if (compareIds(id, last) > 0) lo = mid + 1;
    else return mid;
  }
  return -1;
}
