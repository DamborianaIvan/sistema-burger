export const parseFeatureFlag = (value = 'false') => {
  const normalizado = value.trim().toLowerCase();
  if (!['true', 'false'].includes(normalizado)) {
    throw new Error('ENABLE_PREPIZZAS debe ser true o false');
  }
  return normalizado === 'true';
};
