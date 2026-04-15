import path from 'path';
import dotenv from 'dotenv';
import { ensureDatabaseUrlFromParts } from './lib/ensureDatabaseUrl';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
ensureDatabaseUrlFromParts();
