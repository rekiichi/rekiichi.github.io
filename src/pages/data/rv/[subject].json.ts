// 受験復習モードのまとまりごとの問題ID（/data/rv/科目ID.json）
import type { APIRoute, GetStaticPaths } from 'astro';
import { subjects, toClientReview } from '../../../lib/site-data';

export const getStaticPaths: GetStaticPaths = () => subjects.map((s) => ({ params: { subject: s.id } }));

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(toClientReview(params.subject!)), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
