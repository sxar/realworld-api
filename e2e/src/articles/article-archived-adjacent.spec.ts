import { isArchived, setArchived } from '../support/database';
import {
  TestUser,
  createArticle,
  deleteArticle,
  getTestUser,
  listArticles,
  request,
} from '../support/realworld-api';

describe('endpoints that read archived articles keep working', () => {
  let user: TestUser;
  const created: string[] = [];

  const createArchived = async () => {
    const slug = await createArticle(user.token);
    created.push(slug);
    setArchived(slug, true);
    return slug;
  };

  const listedForAuthor = async (slug: string) =>
    (
      await listArticles({ author: user.username, limit: 100 }, user.token)
    ).slugs.includes(slug);

  beforeAll(async () => {
    user = await getTestUser();
  });

  afterAll(async () => {
    for (const slug of created) {
      await deleteArticle(user.token, slug);
    }
  });

  it('R6a: GET /api/articles/:slug of an archived article answers 200 or 404', async () => {
    const slug = await createArchived();

    const res = await request({ method: 'GET', url: `/api/articles/${slug}` });

    expect([200, 404]).toContain(res.status);
  });

  it('R6b: author can edit and delete an archived article; edit keeps it archived', async () => {
    const slug = await createArchived();

    const put = await request(
      {
        method: 'PUT',
        url: `/api/articles/${slug}`,
        data: { article: { body: 'x' } },
      },
      user.token
    );
    expect([200, 404]).toContain(put.status);
    expect(isArchived(slug)).toBe(true);
    expect(await listedForAuthor(slug)).toBe(false);

    const del = await deleteArticle(user.token, slug);
    expect([200, 204]).toContain(del.status);
    expect(
      (await request({ method: 'GET', url: `/api/articles/${slug}` })).status
    ).toBe(404);
  });

  it('R6c: favoriting and commenting on an archived article do not 5xx', async () => {
    const slug = await createArchived();

    const fav = await request(
      { method: 'POST', url: `/api/articles/${slug}/favorite` },
      user.token
    );
    const comment = await request(
      {
        method: 'POST',
        url: `/api/articles/${slug}/comments`,
        data: { comment: { body: 'hi' } },
      },
      user.token
    );

    expect(fav.status).toBeLessThan(500);
    expect(comment.status).toBeLessThan(500);
    expect(await listedForAuthor(slug)).toBe(false);
  });

  it('R6d: GET /api/tags still returns the tags array', async () => {
    const res = await request({ method: 'GET', url: '/api/tags' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.tags)).toBe(true);
  });
});
