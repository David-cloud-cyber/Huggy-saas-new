import { validateAllowedModel, ForbiddenModelError } from './src/services/ai-validator.ts';
import { AI_ALLOWED_MODELS } from './src/config/ai-models.ts';

async function runTests() {
  console.log('Starting AI Policy Tests...');

  // Test 1: Allowed model
  try {
    const model = AI_ALLOWED_MODELS[0];
    validateAllowedModel(model);
    console.log(`✅ Success: Allowed model ${model} passed validation.`);
  } catch (e) {
    console.error('❌ Failed: Allowed model rejected.');
  }

  // Test 2: Forbidden model
  try {
    validateAllowedModel('openai/gpt-4-total-garbage');
    console.error('❌ Failed: Forbidden model was NOT blocked.');
  } catch (e) {
    if (e instanceof ForbiddenModelError) {
      console.log('✅ Success: Forbidden model correctly blocked.');
    } else {
      console.error('❌ Failed: Unexpected error type for forbidden model.');
    }
  }

  // Test 3: Arbitrary string
  try {
    validateAllowedModel('"><script>alert(1)</script>');
    console.error('❌ Failed: XSS injection attempt was NOT blocked.');
  } catch (e) {
    console.log('✅ Success: Malicious model ID blocked.');
  }

  console.log('Tests completed.');
}

runTests().catch(console.error);
