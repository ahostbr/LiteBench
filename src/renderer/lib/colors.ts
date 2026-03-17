const MODEL_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

const modelColorMap = new Map<string, string>();

export function getModelColor(modelName: string): string {
  if (modelColorMap.has(modelName)) {
    return modelColorMap.get(modelName)!;
  }
  const color = MODEL_COLORS[modelColorMap.size % MODEL_COLORS.length];
  modelColorMap.set(modelName, color);
  return color;
}

export function resetModelColors() {
  modelColorMap.clear();
}
