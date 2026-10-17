import { isArchived, setArchived } from '../support/database';
import {
  TestUser,
  createArticle,
  deleteArticle,
  getTestUser,
  listArticles,
  request,
  uniqueTag,
} from '../support/realworld-api';

describe('GET /api/articles excludes archived articles', () => {
  let user: TestUser;
  const created: string[] = [];
  const archivedSeeded: string[] = [];

  const create = async (fields: Record<string, unknown> = {}) => {
    const slug = await createArticle(user.token, fields);
    created.push(slug);
    return slug;
  };

  const archiveSeeded = (slug: string) => {
    archivedSeeded.push(slug);
    setArchived(slug, true);
  };

  beforeAll(async () => {
    user = await getTestUser();
  });

  afterEach(() => {
    while (archivedSeeded.length) {
      setArchived(archivedSeeded.pop() as string, false);
    }
  });

  afterAll(async () => {
    for (const slug of created) {
      await deleteArticle(user.token, slug);
    }
  });

  it('R1a: anonymous list omits an archived seeded article', async () => {
    const [slug] = (await listArticles({ limit: 1 })).slugs;
    expect((await listArticles({ limit: 100 })).slugs).toContain(slug);

    archiveSeeded(slug);

    expect((await listArticles({ limit: 100 })).slugs).not.toContain(slug);
  });

  it('R1b: articlesCount drops by one when a listed article is archived', async () => {
    const before = await listArticles();

    archiveSeeded(before.slugs[0]);

    expect((await listArticles()).count).toBe(before.count - 1);
  });

  it("R1c: the author's own archived article is omitted, also with ?author=", async () => {
    const slug = await create();
    const before = await listArticles(
      { author: user.username, limit: 100 },
      user.token
    );
    expect(before.slugs).toContain(slug);

    setArchived(slug, true);

    const byAuthor = await listArticles(
      { author: user.username, limit: 100 },
      user.token
    );
    expect(byAuthor.slugs).not.toContain(slug);
    expect(byAuthor.count).toBe(before.count - 1);
    expect(
      (await listArticles({ limit: 100 }, user.token)).slugs
    ).not.toContain(slug);
  });

  it('R1d: archived article is omitted when filtering by tag', async () => {
    const tag = uniqueTag();
    const slug = await create({ tagList: [tag] });
    expect(await listArticles({ tag }, user.token)).toEqual({
      slugs: [slug],
      count: 1,
    });

    setArchived(slug, true);

    expect(await listArticles({ tag }, user.token)).toEqual({
      slugs: [],
      count: 0,
    });
  });

  it('R1e: archived article is omitted when filtering by favorited', async () => {
    const slug = await create();
    const fav = await request(
      { method: 'POST', url: `/api/articles/${slug}/favorite` },
      user.token
    );
    expect(fav.status).toBe(200);
    expect(
      (await listArticles({ favorited: user.username, limit: 100 }, user.token))
        .slugs
    ).toContain(slug);

    setArchived(slug, true);

    expect(
      (await listArticles({ favorited: user.username, limit: 100 }, user.token))
        .slugs
    ).not.toContain(slug);
  });

  it('R1f: pages of limit=2 skip archived articles and add up to articlesCount', async () => {
    const tag = uniqueTag();
    const slugs: string[] = [];
    for (let i = 0; i < 5; i++) {
      slugs.push(await create({ tagList: [tag] }));
    }
    const newestFirst = [...slugs].reverse();
    const archived = [newestFirst[1], newestFirst[3]];
    archived.forEach((slug) => setArchived(slug, true));

    const seen: string[] = [];
    const counts: number[] = [];
    for (const offset of [0, 2, 4]) {
      const page = await listArticles({ tag, limit: 2, offset }, user.token);
      seen.push(...page.slugs);
      counts.push(page.count);
    }

    expect(seen).toEqual([newestFirst[0], newestFirst[2], newestFirst[4]]);
    expect(counts).toEqual([3, 3, 3]);
  });

  it('list-count-matches-pages: limit=1 pages give exactly the 3 non-archived articles', async () => {
    const tag = uniqueTag();
    const slugs: string[] = [];
    for (let i = 0; i < 6; i++) {
      slugs.push(await create({ tagList: [tag] }));
    }
    const archived = slugs.filter((_, i) => i % 2 === 0);
    archived.forEach((slug) => setArchived(slug, true));

    const pages = [];
    for (let offset = 0; offset < 6; offset++) {
      pages.push(await listArticles({ tag, limit: 1, offset }, user.token));
    }
    const nonEmpty = pages.filter((p) => p.slugs.length > 0);

    expect(nonEmpty).toHaveLength(3);
    expect(nonEmpty.flatMap((p) => p.slugs).sort()).toEqual(
      slugs.filter((s) => !archived.includes(s)).sort()
    );
    expect(pages.map((p) => p.count)).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('R2a: a newly created article (no archived field) is listed and counted', async () => {
    const before = await listArticles(
      { author: user.username, limit: 100 },
      user.token
    );

    const slug = await create();

    const after = await listArticles(
      { author: user.username, limit: 100 },
      user.token
    );
    expect(after.slugs).toContain(slug);
    expect(after.count).toBe(before.count + 1);
    expect(isArchived(slug)).toBe(false);
  });

  it('R2c: archived:true in the create body never hides the article silently', async () => {
    const res = await request(
      {
        method: 'POST',
        url: '/api/articles',
        data: {
          article: {
            title: `Archive create ${uniqueTag()}`,
            description: 'archive test',
            body: 'archive test body',
            archived: true,
          },
        },
      },
      user.token
    );
    expect(res.status).toBe(201);
    const slug = res.data.article.slug;
    created.push(slug);

    const listed = (
      await listArticles({ author: user.username, limit: 100 }, user.token)
    ).slugs.includes(slug);
    // Either create ignores the flag (listed), or it honours it (archived and excluded).
    expect(listed).toBe(!isArchived(slug));
  });
});
