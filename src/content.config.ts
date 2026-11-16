// 記事（src/content/articles/*.md）。Markdown で書き、draft: true の間は検索結果に出さない。
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    /** 下書き（true の間は noindex・サイトマップから除外・記事一覧に「下書き」と表示） */
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
