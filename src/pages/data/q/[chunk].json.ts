// 問題データの分割ファイル（/data/q/0.json …）。出題画面が必要な分だけ読み込む。
import type { APIRoute, GetStaticPaths } from 'astro';
import { questionChunks } from '../../../lib/site-data';

export const getStaticPaths: GetStaticPaths = () =>
  questionChunks().map((items, i) => ({ params: { chunk: String(i) }, props: { items } }));

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.items), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
