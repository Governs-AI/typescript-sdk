/**
 * External Memory Usage Example
 *
 * This example demonstrates how external applications can use
 * GovernsAI's unified memory service with their own user IDs.
 *
 * Use Cases:
 * - E-commerce: Store user preferences, purchase history
 * - SaaS: Track user interactions, feature usage
 * - CRM: Customer conversation history, notes
 * - Support: Ticket context, user issues
 */

import { GovernsAIClient } from '../index';

// Initialize the client with your API key and org ID
const client = new GovernsAIClient({
  apiKey: process.env.GOVERNS_API_KEY || 'your-api-key',
  baseUrl: process.env.GOVERNS_BASE_URL || 'https://api.governsai.com',
  orgId: process.env.GOVERNS_ORG_ID || 'org-123',
});

/**
 * Example 1: E-commerce Product Recommendations
 * Store user preferences and retrieve them for personalized recommendations
 */
async function ecommerceExample() {
  console.log('\n=== E-commerce Example ===\n');

  const userId = 'shopify-user-12345';
  const appName = 'shopify-store';

  // Store user preference from product page
  await client.context.storeMemory({
    externalUserId: userId,
    externalSource: appName,
    content: 'User viewed blue running shoes, size 10. Added to cart but did not purchase.',
    agentId: 'product-tracker',
    metadata: {
      productId: 'shoe-001',
      category: 'footwear',
      action: 'cart-add',
      timestamp: new Date().toISOString(),
    },
  });

  console.log('✓ Stored product interaction');

  // Store purchase preference
  await client.context.storeMemory({
    externalUserId: userId,
    externalSource: appName,
    content: 'User prefers express shipping and contactless delivery',
    agentId: 'checkout-preferences',
    metadata: {
      shippingMethod: 'express',
      deliveryType: 'contactless',
    },
  });

  console.log('✓ Stored shipping preferences');

  // Search for product preferences to make recommendations
  const productMemories = await client.context.searchMemory({
    externalUserId: userId,
    externalSource: appName,
    query: 'product preferences and cart items',
    limit: 10,
  });

  console.log(`\n✓ Found ${productMemories.count} relevant memories`);
  console.log('Top memory:', productMemories.memories[0]?.content);

  // Search for shipping preferences during checkout
  const shippingMemories = await client.context.searchMemory({
    externalUserId: userId,
    externalSource: appName,
    query: 'shipping and delivery preferences',
    limit: 5,
  });

  console.log(`\n✓ Found ${shippingMemories.count} shipping preferences`);
  console.log('Preference:', shippingMemories.memories[0]?.content);
}

/**
 * Example 2: Customer Support System
 * Track customer issues and conversation history
 */
async function customerSupportExample() {
  console.log('\n=== Customer Support Example ===\n');

  const customerId = 'zendesk-customer-789';
  const appName = 'zendesk-support';

  // Store support ticket context
  await client.context.storeMemory({
    externalUserId: customerId,
    externalSource: appName,
    content: 'Customer reported login issues on mobile app. iOS 17, Safari browser.',
    agentId: 'support-ticket-123',
    metadata: {
      ticketId: 'TICKET-123',
      category: 'technical',
      platform: 'ios',
      severity: 'high',
    },
  });

  console.log('✓ Stored support ticket');

  // Store resolution
  await client.context.storeMemory({
    externalUserId: customerId,
    externalSource: appName,
    content: 'Resolved login issue by clearing Safari cache. Customer confirmed fix worked.',
    agentId: 'support-ticket-123',
    metadata: {
      ticketId: 'TICKET-123',
      resolution: 'cache-clear',
      status: 'resolved',
    },
  });

  console.log('✓ Stored resolution');

  // When customer contacts support again, search their history
  const customerHistory = await client.context.searchMemory({
    externalUserId: customerId,
    externalSource: appName,
    query: 'previous issues and resolutions',
    limit: 10,
  });

  console.log(`\n✓ Found ${customerHistory.count} previous interactions`);
  customerHistory.memories.forEach((memory, i) => {
    console.log(`  ${i + 1}. ${memory.content}`);
  });
}

/**
 * Example 3: SaaS User Onboarding
 * Track user journey and feature adoption
 */
async function saasOnboardingExample() {
  console.log('\n=== SaaS Onboarding Example ===\n');

  const userId = 'stripe-customer-456';
  const appName = 'stripe-app';

  // Store onboarding progress
  await client.context.storeMemory({
    externalUserId: userId,
    externalSource: appName,
    content: 'User completed profile setup and connected bank account.',
    agentId: 'onboarding-tracker',
    metadata: {
      step: 'profile-complete',
      completedAt: new Date().toISOString(),
    },
  });

  console.log('✓ Stored onboarding progress');

  // Store feature usage
  await client.context.storeMemory({
    externalUserId: userId,
    externalSource: appName,
    content: 'User created first payment link and shared via email. Transaction successful.',
    agentId: 'feature-adoption',
    metadata: {
      feature: 'payment-links',
      action: 'first-transaction',
      success: true,
    },
  });

  console.log('✓ Stored feature usage');

  // Check user's journey for personalized guidance
  const userJourney = await client.context.searchMemory({
    externalUserId: userId,
    externalSource: appName,
    query: 'onboarding progress and feature usage',
    limit: 20,
  });

  console.log(`\n✓ User journey has ${userJourney.count} milestones`);
  console.log('Latest activity:', userJourney.memories[0]?.content);
}

/**
 * Example 4: User Resolution and Management
 * Handle user creation and lookup
 */
async function userManagementExample() {
  console.log('\n=== User Management Example ===\n');

  const userId = 'new-user-999';
  const appName = 'my-app';

  // Explicitly resolve/create a user
  const resolved = await client.context.resolveUser({
    externalUserId: userId,
    externalSource: appName,
    email: 'newuser@example.com',
    name: 'John Doe',
  });

  console.log(`✓ User resolved:`);
  console.log(`  Internal ID: ${resolved.internalUserId}`);
  console.log(`  Was created: ${resolved.created}`);
  console.log(`  Email: ${resolved.user.email}`);

  // Look up existing user without creating
  const existingUser = await client.context.getUserByExternalId({
    externalUserId: userId,
    externalSource: appName,
  });

  if (existingUser) {
    console.log(`\n✓ Found existing user: ${existingUser.email}`);
  } else {
    console.log(`\n✗ User not found`);
  }
}

/**
 * Example 5: Multi-tenant Application
 * Handle multiple external sources in one org
 */
async function multiTenantExample() {
  console.log('\n=== Multi-tenant Example ===\n');

  const userId = 'user-123';

  // Store memory from Shopify integration
  await client.context.storeMemory({
    externalUserId: userId,
    externalSource: 'shopify',
    content: 'User purchased premium plan on Shopify store',
    agentId: 'shopify-integration',
  });

  // Store memory from Stripe integration
  await client.context.storeMemory({
    externalUserId: userId,
    externalSource: 'stripe',
    content: 'User set up recurring payment for premium subscription',
    agentId: 'stripe-integration',
  });

  console.log('✓ Stored memories from multiple sources');

  // Search memories from Shopify
  const shopifyMemories = await client.context.searchMemory({
    externalUserId: userId,
    externalSource: 'shopify',
    query: 'purchases and plans',
    limit: 5,
  });

  console.log(`\n✓ Shopify memories: ${shopifyMemories.count}`);

  // Search memories from Stripe
  const stripeMemories = await client.context.searchMemory({
    externalUserId: userId,
    externalSource: 'stripe',
    query: 'payment and subscription',
    limit: 5,
  });

  console.log(`✓ Stripe memories: ${stripeMemories.count}`);
}

/**
 * Run all examples
 */
async function main() {
  try {
    console.log('🚀 GovernsAI External Memory Examples\n');
    console.log('Using org:', process.env.GOVERNS_ORG_ID || 'org-123');

    await ecommerceExample();
    await customerSupportExample();
    await saasOnboardingExample();
    await userManagementExample();
    await multiTenantExample();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run examples if executed directly
if (require.main === module) {
  main();
}

export {
  ecommerceExample,
  customerSupportExample,
  saasOnboardingExample,
  userManagementExample,
  multiTenantExample,
};
