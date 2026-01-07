/**
 * Label Utilities for Chart Drawing Tools
 * Provides smart label positioning and formatting to prevent overflow
 */

// Constants for label formatting and positioning
const PRICE_FORMAT_THRESHOLD = 1000; // Above this value, use 2 decimals; below use 4
const AVG_CHAR_WIDTH_MULTIPLIER = 0.65; // Average character width relative to font size

export interface LabelBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ConstrainedLabel {
  x: number;
  y: number;
  textAnchor: 'start' | 'middle' | 'end';
  isConstrained: boolean;
}

/**
 * Constrains a label position to stay within chart bounds
 * Adjusts text-anchor intelligently based on overflow direction
 * 
 * @param targetX - Desired X position for label
 * @param targetY - Desired Y position for label
 * @param labelWidth - Estimated width of label text
 * @param labelHeight - Height of label text (usually font size)
 * @param bounds - Chart boundaries (left, right, top, bottom)
 * @param padding - Minimum padding from edges
 * @returns Constrained position with appropriate text-anchor
 */
export function constrainLabelPosition(
  targetX: number,
  targetY: number,
  labelWidth: number,
  labelHeight: number,
  bounds: LabelBounds,
  padding: number = 10
): ConstrainedLabel {
  let x = targetX;
  let y = targetY;
  let textAnchor: 'start' | 'middle' | 'end' = 'middle';
  let isConstrained = false;

  // Check horizontal overflow with middle anchor (default)
  const halfWidth = labelWidth / 2;
  const leftEdge = targetX - halfWidth;
  const rightEdge = targetX + halfWidth;

  if (rightEdge > bounds.right - padding) {
    // Label would overflow right edge
    // Move it left and use 'end' anchor
    x = Math.min(targetX, bounds.right - padding);
    textAnchor = 'end';
    isConstrained = true;
  } else if (leftEdge < bounds.left + padding) {
    // Label would overflow left edge
    // Move it right and use 'start' anchor
    x = Math.max(targetX, bounds.left + padding);
    textAnchor = 'start';
    isConstrained = true;
  }

  // Check vertical overflow
  if (targetY - labelHeight < bounds.top + padding) {
    // Would overflow top
    y = bounds.top + padding + labelHeight;
    isConstrained = true;
  } else if (targetY > bounds.bottom - padding) {
    // Would overflow bottom
    y = bounds.bottom - padding;
    isConstrained = true;
  }

  return { x, y, textAnchor, isConstrained };
}

/**
 * Formats a price value with appropriate decimal places
 * 
 * @param price - Price to format
 * @returns Formatted price string
 */
export function formatPrice(price: number): string {
  return price >= PRICE_FORMAT_THRESHOLD ? price.toFixed(2) : price.toFixed(4);
}

/**
 * Formats a Fibonacci level label with optional price
 * Supports both full and abbreviated modes
 * 
 * @param ratio - Fibonacci ratio (e.g., 0.618)
 * @param price - Price at this level
 * @param showPrice - Whether to include price in label
 * @param abbreviated - Use compact format (% only)
 * @returns Formatted label text
 */
export function formatFibonacciLabel(
  ratio: number,
  price: number,
  showPrice: boolean = true,
  abbreviated: boolean = false
): string {
  const percentage = (ratio * 100).toFixed(1);
  
  if (abbreviated) {
    return `${percentage}%`;
  }
  
  if (showPrice) {
    return `${percentage}% ($${formatPrice(price)})`;
  }
  
  return `${percentage}%`;
}

/**
 * Estimates the width of text in pixels
 * Uses a simple approximation based on character count and font size
 * 
 * @param text - Text to measure
 * @param fontSize - Font size in pixels
 * @returns Estimated width in pixels
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  // Average character width is approximately AVG_CHAR_WIDTH_MULTIPLIER * fontSize
  const avgCharWidth = fontSize * AVG_CHAR_WIDTH_MULTIPLIER;
  return text.length * avgCharWidth;
}

/**
 * Checks if two labels would collide
 * 
 * @param label1 - First label position and dimensions
 * @param label2 - Second label position and dimensions
 * @param minDistance - Minimum distance between labels
 * @returns True if labels would overlap
 */
export function wouldLabelsCollide(
  label1: { x: number; y: number; width: number; height: number },
  label2: { x: number; y: number; width: number; height: number },
  minDistance: number = 5
): boolean {
  // Check if rectangles overlap with minimum distance buffer
  const horizontalOverlap = 
    label1.x < label2.x + label2.width + minDistance &&
    label1.x + label1.width + minDistance > label2.x;
  
  const verticalOverlap = 
    label1.y < label2.y + label2.height + minDistance &&
    label1.y + label1.height + minDistance > label2.y;
  
  return horizontalOverlap && verticalOverlap;
}

/**
 * Adjusts label position to avoid collision with existing labels
 * Tries moving vertically first, then horizontally if needed
 * 
 * @param targetLabel - Label to position
 * @param existingLabels - Array of already positioned labels
 * @param bounds - Chart boundaries
 * @param minDistance - Minimum distance between labels
 * @returns Adjusted position or original if no collision
 */
export function adjustLabelForCollisions(
  targetLabel: { x: number; y: number; width: number; height: number },
  existingLabels: Array<{ x: number; y: number; width: number; height: number }>,
  bounds: LabelBounds,
  minDistance: number = 20
): { x: number; y: number } {
  let adjustedX = targetLabel.x;
  let adjustedY = targetLabel.y;
  
  // Check for collisions
  for (const existing of existingLabels) {
    if (wouldLabelsCollide(
      { ...targetLabel, x: adjustedX, y: adjustedY },
      existing,
      minDistance
    )) {
      // Try moving down first
      adjustedY = existing.y + existing.height + minDistance;
      
      // If still out of bounds, try moving up instead
      if (adjustedY + targetLabel.height > bounds.bottom) {
        adjustedY = existing.y - targetLabel.height - minDistance;
      }
      
      // If still out of bounds, try moving horizontally
      if (adjustedY < bounds.top || adjustedY + targetLabel.height > bounds.bottom) {
        adjustedY = targetLabel.y; // Reset Y
        adjustedX = existing.x + existing.width + minDistance;
        
        // If horizontal movement also fails, keep original position
        if (adjustedX + targetLabel.width > bounds.right) {
          adjustedX = targetLabel.x;
          adjustedY = targetLabel.y;
        }
      }
    }
  }
  
  return { x: adjustedX, y: adjustedY };
}

/**
 * Creates a tooltip text for an abbreviated label
 * Used when full label text doesn't fit
 * 
 * @param fullText - Complete label text
 * @param ratio - Fibonacci ratio
 * @param price - Price at this level
 * @returns Tooltip text
 */
export function createLabelTooltip(
  fullText: string,
  ratio?: number,
  price?: number
): string {
  if (ratio !== undefined && price !== undefined) {
    const percentage = (ratio * 100).toFixed(1);
    return `Fibonacci ${percentage}% - $${formatPrice(price)}`;
  }
  return fullText;
}
