// 教科書の章・節と問題IDの対応（/data/tb/教科書ID.json）。出題画面が範囲を組み立てるのに使う。
import type { APIRoute, GetStaticPaths } from 'astro';
import { textbooks, toClientTextbook } from '../../../lib/site-data';

export const getStaticPaths: GetStaticPaths = () => textbooks.map((tb) => ({ params: { id: tb.id }, props: { tb } }));

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(toClientTextbook(props.tb)), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
