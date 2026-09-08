/**
 * Panier de la boutique en ligne, conservé dans le localStorage du visiteur
 * (clé par marque). Aucune connexion n'est requise pour acheter.
 */

export type CartItem = {
  variantId: number;
  productId: number;
  name: string;
  size?: string;
  color?: string;
  unitPrice: number;
  quantity: number;
  customMeasurements?: string;
};

const cartKey = (slug: string) => `am_cart_${slug}`;

export function readCart(slug: string): CartItem[] {
  try {
    const raw = localStorage.getItem(cartKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function writeCart(slug: string, items: CartItem[]): void {
  try {
    localStorage.setItem(cartKey(slug), JSON.stringify(items));
  } catch {
    // localStorage indisponible (navigation privée stricte) : panier volatil.
  }
}

export function addToCart(slug: string, item: CartItem): CartItem[] {
  const cart = readCart(slug);
  const existing = cart.find((row) => row.variantId === item.variantId);
  if (existing) {
    existing.quantity += item.quantity;
    writeCart(slug, cart);
    return cart;
  }
  cart.push(item);
  writeCart(slug, cart);
  return cart;
}

export function removeFromCart(slug: string, variantId: number): CartItem[] {
  const cart = readCart(slug).filter((row) => row.variantId !== variantId);
  writeCart(slug, cart);
  return cart;
}

export function updateQuantity(slug: string, variantId: number, quantity: number): CartItem[] {
  const cart = readCart(slug).map((row) => (row.variantId === variantId ? { ...row, quantity: Math.max(1, quantity) } : row));
  writeCart(slug, cart);
  return cart;
}

export function clearCart(slug: string): void {
  writeCart(slug, []);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, row) => sum + row.quantity, 0);
}
