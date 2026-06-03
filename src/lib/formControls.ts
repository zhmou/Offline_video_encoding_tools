type NumericControlTarget = EventTarget & {
  value?: unknown;
  currentValue?: unknown;
  getAttribute?: (name: string) => string | null;
};

export function readNumericControlValue(target: EventTarget | null, fallback: number): number {
  const control = target as NumericControlTarget | null;
  // Fluent Web Components 的实时值会出现在不同属性或特性上。
  const candidates = [
    control?.value,
    control?.currentValue,
    control?.getAttribute?.('current-value'),
    control?.getAttribute?.('aria-valuenow'),
  ];

  for (const rawValue of candidates) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      continue;
    }

    const value = Number(rawValue);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

export function isBlockedPositiveNumberKey(key: string): boolean {
  // 原生 number 输入允许符号和指数写法，这里都不是合法的目标 MB。
  return key === '-' || key === '+' || key === 'e' || key === 'E';
}
