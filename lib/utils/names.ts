/** Case-insensitive, whitespace-trimmed name comparison used to keep player
 * and court names unique within their own list. */
export function isNameTaken(
  name: string,
  existing: { id: string; name: string }[],
  excludeId?: string,
): boolean {
  const normalized = name.trim().toLowerCase();
  return existing.some((item) => item.id !== excludeId && item.name.trim().toLowerCase() === normalized);
}
