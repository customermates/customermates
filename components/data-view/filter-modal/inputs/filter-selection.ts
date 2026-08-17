export function nextFilterSelection(selectedKeys: string[], key: string, maxSelectedValues?: number): string[] {
  if (selectedKeys.includes(key)) return selectedKeys.filter((selectedKey) => selectedKey !== key);
  if (maxSelectedValues !== undefined && selectedKeys.length >= maxSelectedValues) return selectedKeys;
  return [...selectedKeys, key];
}
