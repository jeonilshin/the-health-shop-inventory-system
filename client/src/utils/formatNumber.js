// Format quantity (no decimals or 1-2 decimals if needed)
export const formatQuantity = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return '0';
  
  // If it's a whole number, show no decimals
  if (num % 1 === 0) return num.toString();
  
  // If it has decimals, show up to 2 decimal places, but remove trailing zeros
  return num.toFixed(2).replace(/\.?0+$/, '');
};

// Format price with 2 decimals and comma separators
export const formatPrice = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return '0.00';
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};
