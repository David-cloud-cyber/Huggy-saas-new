import assert from 'node:assert/strict';
import {
  buildHuggyCloudSchemaName,
  detectHuggyCloudRequirements,
  hasHuggyCloudRequirement,
  summarizeHuggyCloudRequirements,
} from './src/services/huggy-cloud.ts';

{
  const result = detectHuggyCloudRequirements('Crée un CRM avec login, clients, factures et notes.');
  assert.equal(result.needs_auth, true);
  assert.equal(result.needs_database, true);
  assert.equal(result.needs_storage, false);
  assert.equal(result.recommended_mode, 'shared');
  assert.ok(result.detected_from_prompt.includes('auth'));
  assert.ok(result.detected_from_prompt.includes('database'));
  assert.equal(hasHuggyCloudRequirement(result), true);
}

{
  const result = detectHuggyCloudRequirements('Build a marketplace with vendors, products, orders and product photos.');
  assert.equal(result.needs_auth, true);
  assert.equal(result.needs_database, true);
  assert.equal(result.needs_storage, true);
  assert.equal(result.recommended_mode, 'shared');
}

{
  const result = detectHuggyCloudRequirements('Add Stripe webhook handling, email notifications, and webhook secret storage.');
  assert.equal(result.needs_edge_functions, true);
  assert.equal(result.needs_secrets, true);
  assert.equal(result.needs_database, false);
}

{
  const result = detectHuggyCloudRequirements('Create a static landing page for a design studio.');
  assert.equal(hasHuggyCloudRequirement(result), false);
  assert.equal(result.summary, 'No managed backend required.');
}

{
  const result = detectHuggyCloudRequirements('Create a business CRM with a dedicated isolated backend for compliance.');
  assert.equal(result.needs_database, true);
  assert.equal(result.recommended_mode, 'dedicated');
  assert.match(summarizeHuggyCloudRequirements(result), /dedicated/);
}

{
  assert.equal(buildHuggyCloudSchemaName('ABC-123 hello'), 'app_abc_123_hello');
  assert.equal(buildHuggyCloudSchemaName(''), 'app_project');
}

console.log('test-huggy-cloud passed');
