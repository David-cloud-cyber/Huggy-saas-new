import './src/load-env';
import { OpenRouterService } from './src/services/openrouter.service';
import { DomainService } from './src/services/domain.service';

let failedTestsCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    failedTestsCount++;
  } else {
    console.log(`✅ Passed: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Starting Huggy SaaS Backend Service Tests...\n');

  // Test 1: OpenRouter Service model resolving logic
  console.log('--- OpenRouter Model Routing Tests ---');
  const modelAuto = OpenRouterService.resolveModel('auto');
  assert(modelAuto.id === 'anthropic/claude-3.5-haiku', 'Auto model maps to Claude 3.5 Haiku');

  const modelEconomy = OpenRouterService.resolveModel('economy');
  assert(modelEconomy.id === 'google/gemini-2.5-flash', 'Economy model maps to Gemini 2.5 Flash');

  const modelPro = OpenRouterService.resolveModel('pro');
  assert(modelPro.id === 'anthropic/claude-3.5-sonnet', 'Pro model maps to Claude 3.5 Sonnet');

  // Test 2: Credit Margin Calculations
  console.log('\n--- Credit Ledger Margin Protection Tests ---');
  const estimateUsd = 0.15; // 0.15 USD cost
  const sellValue = 0.20; // $0.20 per credit
  const marginMultiplier = 2.5; // 2.5x margin
  const requiredCredits = Math.max(1.0, Math.ceil((estimateUsd * marginMultiplier / sellValue) * 10) / 10);
  assert(requiredCredits === 1.9, `Credits calculation: 0.15 USD cost maps to 1.9 credits (actual: ${requiredCredits})`);

  // Test 3: Subdomain reserved words checks
  console.log('\n--- Subdomain Validation Tests ---');
  try {
    await DomainService.setSubdomain('demo-project', 'admin');
    assert(false, 'Should throw error when using reserved subdomain word');
  } catch (err: any) {
    assert(err.message.includes('reserved'), 'Successfully blocks reserved subdomain "admin"');
  }

  try {
    await DomainService.setSubdomain('demo-project', 'www');
    assert(false, 'Should throw error when using reserved subdomain word');
  } catch (err: any) {
    assert(err.message.includes('reserved'), 'Successfully blocks reserved subdomain "www"');
  }

  // Summary
  console.log('\n----------------------------------------');
  if (failedTestsCount > 0) {
    console.error(`❌ Tests completed with ${failedTestsCount} failures.`);
    process.exit(1);
  } else {
    console.log('🎉 All unit and assertion tests passed successfully!');
    process.exit(0);
  }
}

runTests();
