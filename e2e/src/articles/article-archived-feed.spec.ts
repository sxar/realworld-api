import { setArchived } from '../support/database';
import {
  TestUser,
  createArticle,
  getFeed,
  getTestUser,
  registerUser,
  request,
} from '../support/realworld-api';

describe('GET /api/articles/feed excludes archived articles', () => {
  let user: TestUser;
  let author: TestUser;

  beforeAll(async () => {
    user = await getTestUser();
    author = await registerUser();
    const follow = await request(
      { method: 'POST', url: `/api/profiles/${author.username}/follow` },
      user.token
    );
    expect(follow.status).toBe(200);
  });

  afterAll(async () => {
    if (!author) return;
    await request(
      { method: 'DELETE', url: `/api/profiles/${author.username}/follow` },
      user.token
    );
  });

  it('R5a: archived article of a followed author leaves the feed and its count', async () => {
    const slug = await createArticle(author.token);
    const before = await getFeed(user.token, { limit: 100 });
    expect(before.slugs).toContain(slug);

    setArchived(slug, true);

    const after = await getFeed(user.token, { limit: 100 });
    expect(after.slugs).not.toContain(slug);
    expect(after.count).toBe(before.count - 1);
  });

  it('feed-excludes-archived: article archived before the feed is read is not in it', async () => {
    const slug = await createArticle(author.token);
    setArchived(slug, true);

    const feed = await getFeed(user.token, { limit: 100 });

    expect(feed.slugs).not.toContain(slug);
    expect(feed.count).toBe(feed.slugs.length);
  });
});
