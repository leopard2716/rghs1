export function fieldValue(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export function optionalFieldValue(form: FormData, key: string): string | undefined {
  const value = fieldValue(form, key);
  return value.length > 0 ? value : undefined;
}
