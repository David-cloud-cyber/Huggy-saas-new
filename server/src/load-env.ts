import { config } from 'dotenv';
import { join } from 'path';

// Load .env.local from project root
config({ path: join(process.cwd(), '.env.local') });
