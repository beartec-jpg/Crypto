// Stripe Products Seed Script - Creates subscription products and prices
// Run with: npx tsx scripts/seed-stripe-products.ts

import { getUncachableStripeClient } from '../server/stripeClient';

import { PAID_TIER_CONFIG, PAID_TIER_IDS } from '../shared/stripeTiers';

// Free tier has no Stripe product. Paid tiers come from shared/stripeTiers.ts
// (pricing page is the source of truth: Core £15, Pro £30, Elite £50 per month, GBP).
const PRODUCTS = PAID_TIER_IDS.map((id) => {
  const c = PAID_TIER_CONFIG[id];
  return {
    name: c.name,
    description: c.description,
    metadata: { tier: c.tier, type: 'base_tier' } as Record<string, string>,
    priceAmount: c.amountPence, // pence
    interval: c.interval,
    envVar: c.priceEnvVar,
  };
});

async function seedProducts() {
  console.log('🚀 Starting Stripe product seed...');
  
  const stripe = await getUncachableStripeClient();
  const envLines: string[] = [];
  
  for (const product of PRODUCTS) {
    // Check if product already exists
    const existing = await stripe.products.search({
      // Match on metadata.tier so existing products (e.g. legacy 'Intermediate membership') are reused, not duplicated.
      query: `active:'true' AND metadata['tier']:'${product.metadata.tier}'`,
    });
    
    if (existing.data.length > 0) {
      console.log(`⏭️  Product "${product.name}" already exists (${existing.data[0].id})`);
      
      // Check if price exists
      const prices = await stripe.prices.list({
        product: existing.data[0].id,
        active: true,
      });
      
      const match = prices.data.find(p => p.unit_amount === product.priceAmount && p.currency === 'gbp'
        && p.recurring?.interval === product.interval && (p.recurring?.interval_count ?? 1) === 1);
      if (match) {
        console.log(`   Matching price: ${match.id}`);
        envLines.push(`${product.envVar}=${match.id}`);
      } else {
        const price = await stripe.prices.create({
          product: existing.data[0].id,
          unit_amount: product.priceAmount,
          currency: 'gbp',
          recurring: { interval: product.interval },
          metadata: product.metadata,
        });
        console.log(`   Created price: ${price.id} (£${product.priceAmount / 100}/${product.interval})`);
        envLines.push(`${product.envVar}=${price.id}`);
      }
      continue;
    }
    
    // Create product
    const createdProduct = await stripe.products.create({
      name: product.name,
      description: product.description,
      metadata: product.metadata,
    });
    
    console.log(`✅ Created product: ${product.name} (${createdProduct.id})`);
    
    // Create price
    const price = await stripe.prices.create({
      product: createdProduct.id,
      unit_amount: product.priceAmount,
      currency: 'gbp',
      recurring: { interval: product.interval },
      metadata: product.metadata,
    });
    
    console.log(`   Created price: ${price.id} (£${product.priceAmount / 100}/${product.interval})`);
    envLines.push(`${product.envVar}=${price.id}`);
  }

  console.log('\nSet these env vars (Vercel + .env) to pin checkout prices:');
  for (const line of envLines) console.log(`  ${line}`);
  
  console.log('\n✨ Stripe product seed complete!');
  console.log('\nProducts created:');
  
  // List all products with prices
  const allProducts = await stripe.products.list({ active: true });
  for (const prod of allProducts.data) {
    const prices = await stripe.prices.list({ product: prod.id, active: true });
    for (const price of prices.data) {
      console.log(`  ${prod.name}: ${price.id} (£${price.unit_amount! / 100}/${price.recurring?.interval})`);
    }
  }
}

seedProducts().catch(console.error);
