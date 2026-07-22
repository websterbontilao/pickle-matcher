export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}
