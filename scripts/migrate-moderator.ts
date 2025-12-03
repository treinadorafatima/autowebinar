import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  try {
    await db.execute(sql`ALTER TABLE webinars ADD COLUMN IF NOT EXISTS moderator_token TEXT`);
    console.log('Added moderator_token to webinars');
    
    await db.execute(sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS moderator_name TEXT`);
    console.log('Added moderator_name to comments');
    
    await db.execute(sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_moderator_message BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log('Added is_moderator_message to comments');
    
    await db.execute(sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE`);
    console.log('Added approved to comments');
    
    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrate();
