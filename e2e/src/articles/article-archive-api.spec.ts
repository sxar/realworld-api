import { isArchived } from '../support/database';
import {
  TestUser,
  createArticle,
  deleteArticle,
  getTestUser,
  listArticles,
  registerUser,
  request,
} from '../support/realworld-api';

describe('PUT /api/articles/:slug sets the archived flag', () => {
  let user: TestUser;
  const created: string[] = [];

  const create = async () => {
    const slug = await createArticle(user.token);
    created.push(slug);
    return slug;
  };

  const archive = (slug: string, token: string) =>
    request(
      {
        method: 'PUT',
        url: `/api/articles/${slug}`,
        data: { article: { archived: true } },
      },
      token
    );

  beforeAll(async () => {
    user = await getTestUser();
  });

  afterAll(async () => {
    for (const slug of created) {
      await deleteArticle(user.token, slug);
    }
  });

  it('R4a: the author archives an article through the API and it leaves the list', async () => {
    const slug = await create();

    await archive(slug, user.token);

    expect(
      (await listArticles({ author: user.username, limit: 100 }, user.token))
        .slugs
    ).not.toContain(slug);
  });

  it('author-archives-via-put: PUT returns 200 and articlesCount drops by one', async () => {
    const slug = await create();
    const before = await listArticles(
      { author: user.username, limit: 100 },
      user.token
    );

    const res = await archive(slug, user.token);

    expect(res.status).toBe(200);
    expect(
      (await listArticles({ author: user.username, limit: 100 }, user.token))
        .count
    ).toBe(before.count - 1);
  });

  it("R4b: another user cannot archive the author's article", async () => {
    const slug = await create();
    const other = await registerUser();

    const res = await archive(slug, other.token);

    expect(res.status).toBe(403);
    expect(isArchived(slug)).toBe(false);
    expect(
      (await listArticles({ author: user.username, limit: 100 }, user.token))
        .slugs
    ).toContain(slug);
  });
});
