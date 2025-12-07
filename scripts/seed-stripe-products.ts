// Stripe Products Seed Script - Creates subscription products and prices
// Run with: npx tsx scripts/seed-stripe-products.ts

import { getUncachableStripeClient } from '../server/stripeClient';

interface ProductConfig {
  name: string;
  description: string;
  metadata: Record<string, string>;
  priceAmount: number; // in cents
  interval: 'month' | 'year';
}

const PRODUCTS: ProductConfig[] = [
  {
    name: 'Beginner',
    description: 'Basic access to crypto indicators and training',
    metadata: { tier: 'beginner', type: 'base_tier' },
    priceAmount: 500, // $5/month
    interval: 'month',
  },
  {
    name: 'Intermediate',
    description: 'AI analysis credits (50/month) plus all Beginner features',
    metadata: { tier: 'intermediate', type: 'base_tier' },
    priceAmount: 1500, // $15/month
    interval: 'month',
  },
  {
    name: 'Pro',
    description: 'Unlimited AI analysis plus push notifications',
    metadata: { tier: 'pro', type: 'base_tier' },
    priceAmount: 3000, // $30/month
    interval: 'month',
  },
  {
    name: 'Elite',
    description: 'Everything including Elliott Wave analysis (all features)',
    metadata: { tier: 'elite', type: 'base_tier' },
    priceAmount: 5000, // $50/month
    interval: 'month',
  },
  {
    name: 'Elliott Wave Add-on',
    description: 'Elliott Wave pattern analysis - works with any base tier',
    metadata: { tier: 'elliott_addon', type: 'addon' },
    priceAmount: 1000, // $10/month
    interval: 'month',
  },
];

async function seedProducts() {
  console.log('🚀 Starting Stripe product seed...');
  
  const stripe = await getUncachableStripeClient();
  
  for (const product of PRODUCTS) {
    // Check if product already exists
    const existing = await stripe.products.search({
      query: `name:'${product.name}'`,
    });
    
    if (existing.data.length > 0) {
      console.log(`⏭️  Product "${product.name}" already exists (${existing.data[0].id})`);
      
      // Check if price exists
      const prices = await stripe.prices.list({
        product: existing.data[0].id,
        active: true,
      });
      
      if (prices.data.length > 0) {
        console.log(`   Price: ${prices.data[0].id} ($${prices.data[0].unit_amount! / 100}/${prices.data[0].recurring?.interval})`);
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
      currency: 'usd',
      recurring: { interval: product.interval },
      metadata: product.metadata,
    });
    
    console.log(`   Created price: ${price.id} ($${product.priceAmount / 100}/${product.interval})`);
  }
  
  console.log('\n✨ Stripe product seed complete!');
  console.log('\nProducts created:');
  
  // List all products with prices
  const allProducts = await stripe.products.list({ active: true });
  for (const prod of allProducts.data) {
    const prices = await stripe.prices.list({ product: prod.id, active: true });
    for (const price of prices.data) {
      console.log(`  ${prod.name}: ${price.id} ($${price.unit_amount! / 100}/${price.recurring?.interval})`);
    }
  }
}

seedProducts().catch(console.error);
