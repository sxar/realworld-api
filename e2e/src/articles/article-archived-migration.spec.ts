import { psql } from '../support/database';
import { listArticles, request } from '../support/realworld-api';

const MIGRATION = '20261017071323_article_archived';

describe('article_archived migration', () => {
  it('R3a: the migration is recorded as applied, not failed', () => {
    const row = psql(
      `SELECT finished_at IS NOT NULL, rolled_back_at IS NULL FROM "_prisma_migrations" WHERE migration_name='${MIGRATION}'`
    );

    expect(row).toBe('t|t');
  });

  it('migration-applies-on-existing-db: "Article".archived is boolean NOT NULL DEFAULT false', () => {
    const column = psql(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='Article' AND column_name='archived'`
    );

    expect(column).toBe('boolean|NO|false');
  });

  it('R3b: the app serves the article list after the migration', async () => {
    const res = await request({
      method: 'GET',
      url: '/api/articles',
      params: { limit: 1 },
    });

    expect(res.status).toBe(200);
    expect(res.data.articlesCount).toBeGreaterThanOrEqual(1);
  });

  it('R2b: seeded articles default to archived=false and all stay listed', async () => {
    const notFalse = psql(
      `SELECT count(*) FROM "Article" WHERE archived IS DISTINCT FROM false`
    );
    const demoArticles = Number(
      psql(
        `SELECT count(*) FROM "Article" a JOIN "User" u ON u.id=a."authorId" WHERE u.demo`
      )
    );

    expect(notFalse).toBe('0');
    expect(demoArticles).toBeGreaterThan(0);
    expect((await listArticles()).count).toBe(demoArticles);
  });
});
