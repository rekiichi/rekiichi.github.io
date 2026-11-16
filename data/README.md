# data/ — 問題と教科書のデータ

| ファイル | 内容 |
| --- | --- |
| `questions/*.csv` | 問題（1行1問）。スプレッドシートから CSV（UTF-8）で書き出して置く |
| `textbooks/*.csv` | 教科書（1ファイル1冊）。章・節の番号と見出し、各節の問題ID |
| `questions/*.json`・`textbooks/*.json` | CSV から自動で作られる JSON（`npm run data:csv`）。直接編集しない。CSV を使わず JSON を手で書いてもよい |
| `subjects.json` | 科目と、受験復習モードの「縦割りの軸」「横割りの時代区分」 |
| `taxonomy.json` | 地域タグ・テーマタグの一覧 |

- 列の書式・書き方の例は、リポジトリ直下の README.md の「問題の追加方法（CSV の書式）」「教科書データの追加方法」を見てください。
- `sample-` で始まるファイル・ID は開発用のサンプルです（実在の教科書とは関係ありません）。
- 変更したら `npm run data` で変換と検証をします（`npm run dev` / `npm run build` でも自動で実行されます）。
- 「確認済み」が TRUE の問題だけがサイトに出ます。
