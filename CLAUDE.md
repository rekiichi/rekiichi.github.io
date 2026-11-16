# CLAUDE.md

高校生向けの歴史一問一答サイト（歴史総合・世界史探究・日本史探究）。最大の特徴は「自分の学校の教科書と定期テスト範囲（章・節）を選ぶと、その範囲だけの問題セットが作れる」こと。Astro の静的サイト（SSG）で、GitHub Pages に GitHub Actions で公開する。のちに Google AdSense で広告を出す予定。

使い方・データの書式・公開手順は README.md にある。この文書は、作業するときに守る方針をまとめたもの。

## 守ること

### データ

- **実在の教科書の章立てを、記憶や推測で作らない。** 運営者が用意した（または確かめた）出版社の公開資料から写し、`出典`（`source`）に資料名を書く。資料からわからないこと（部の扉のページ数など）は推測で埋めない（入力済みの3冊の決めごとは README の「入力済みの教科書」）。
- 収録している問題（世界史探究 1,905問・日本史探究 1,474問・歴史総合 432問）は、運営者の依頼で、生成AI（Claude）が高校の歴史で一般に学ぶ内容をもとに作成した（2026年11月）。教科書の本文は参照していない。運営者情報のページに、生成AIで作成したことと、誤りがありうることを書いている（消さない）。
- **問題を足す・直すとき**: 教科書の本文や市販の問題集を写さない。確信のない事実（年号・人名の漢字・数字）は書かず、あいまいなら問題にしない。問題文は1文で、答えの語を問題文に入れない。答えは1語（別の表記は別解）。読みは読みにくい漢字の答えにだけ、ひらがなで。解説は1文。年代はできるだけ付ける（横割り・縦割りの並びに使う）。誤りの報告を受けたら、事実を確かめてから CSV の該当行だけを直す。
- 問題ID は `<w|j|r>-<章2けた><節2けた>-<連番2けた>`（README「問題ID の付け方」）。教科書の CSV は `w-0102-*` の形で節の問題をまとめて指している。問題を足すときは、その節の最後の番号の続きを使う。
- 開発用のサンプルは、ID・ファイル名が `sample-` で始まるものだけにし、「サンプル」と明記する（README やコメントの例にも実在の教科書名・章立てを書かない）。サンプルは公開するサイトには出さない（`includeSampleData: false`）が、自動テスト（`tests/`）が使うので消さない。
- 問題データ（`data/questions/`）と教科書対応データ（`data/textbooks/`）は分ける。教科書の各節が問題IDを参照する（1つの問題を複数の教科書で使える）。
- `verified: true`（確認済み）の問題だけを公開する。この判定は `src/lib/site-data.ts` に集めてある。
- CSV が元データ。CSV から生成された JSON（`"generatedFrom"` がある）は直接編集しない。CSV を直したら `npm run data` で変換・検証する。
- **公開済みの問題ID・教科書ID・章番号・URL の形は変えない。** 学習記録（苦手）・マイ範囲・共有された URL が壊れる。
- 検証ルールを足したら `scripts/lib/validate.ts` と `tests/validate.test.ts` の両方を直す。データのエラーはビルドを止める（`prebuild` で `npm run data`）。

### ページ・機能

- ページは静的 HTML で生成する。科目・教科書・章・受験復習モードのページは `getStaticPaths` で作り、1ページ内の JavaScript の切り替えだけにしない（検索に載せるため）。章ページ・復習ページの問題と答えは HTML に含める（答えは赤シート方式で隠す）。
- 出題画面（`/practice/`）とマイページ（`/my/`）は JavaScript で組み立てるアプリなので `noindex`。問題が0問のページも `noindex` にする。`noindex` のページはサイトマップに自動で入らない。
- 範囲は出題画面の URL パラメータ（`src/lib/params.ts`・`src/lib/range.ts`）で表す。共有・マイ範囲・履歴はすべてこの URL で持つ。書式を変えるときは古い URL も読めるようにする。
- 全ページのフッター（`src/components/Footer.astro`）に「教科書会社とは関係のない個人サイトです。教科書名は対応範囲を示すためだけに使用しています。」を表示する。消さない（`npm run check:dist` が確認する）。
- 新しいページは `BaseLayout` に `title`・`description`・`path` を渡す（title・meta description・canonical・OGP が出る）。

### プライバシー・広告

- ログイン機能を作らない。個人情報を集めない。アクセス解析も入れていない（入れるならプライバシーポリシーを先に直す）。
- 保存は localStorage だけ。必ず `src/client/storage.ts`（try/catch で包んだラッパー）を通す。読んだ値は `src/lib/records.ts`・`src/lib/stats.ts` の sanitize を通す。キーの接頭辞 `rekishi-ichimon:` は変えない。
- 広告は `src/components/AdSlot.astro` だけで出す（`ADSENSE_CLIENT` と `ADSENSE_SLOT` が設定されているときだけ広告のコードを出し、ないときは HTML コメントで位置を示すだけ）。**ボタン・チェックボックス・○×ボタンなど、よく押す操作部品のすぐ近くには置かない。** 見出しや本文のまとまりの間に置く。出題中の画面には置かない（出題画面は結果画面の下部だけ）。AdSense の自動広告は使わない前提。
- お問い合わせフォームの URL・AdSense の ID・運営者名などは、環境変数（GitHub のリポジトリ変数）か `src/site.config.ts` で決まる。読み取りと形式の確認は `src/lib/public-settings.ts` に集めてある（ビルド時だけ使う。`src/client/` から import しない）。変数を足したら `.github/workflows/deploy.yml` の `env` と README の表も直す。
- 広告・Cookie・localStorage の扱いを変えたら、プライバシーポリシー（`src/pages/privacy.astro`）も直す。

### 技術

- 軽量に保つ。UI フレームワーク（React など）を入れず、ブラウザ側は素の TypeScript（`src/client/`）。Web フォントを使わない。依存パッケージを増やすときは理由を説明する。
- スマホ優先のレスポンシブ。ダークモードは CSS 変数（`src/styles/global.css` の `:root`）で、OS の設定と切り替えボタン（`<html data-theme>`）の両方に対応する。色を足すときはライト・ダーク両方に定義する。
- サイト内リンクは必ずベースパス付きにする。ページでは `joinBase(import.meta.env.BASE_URL, paths.xxx())`、ブラウザ側では `href(paths.xxx())`（`src/client/dom.ts`）。パスは `src/lib/url.ts` の `paths` に集める。
- 公開先は環境変数 `SITE_URL`・`BASE_PATH`（`astro.config.mjs`）で決める。GitHub Pages 以外の静的ホスティングでも同じビルドで動くようにする。
- ロジックは `src/lib/`（ページとブラウザで共有、DOM を触らない）と `scripts/lib/`（CSV・検証）に書き、`tests/` でテストする。
- Astro 7 の `compressHTML`（既定）は JSX 式の空白処理。改行をまたぐ空白は消えるので、空白が必要なら同じ行に書くか `{' '}` を使う。
- Node.js は 22.23.4 以上（Astro 7 の要件。`.nvmrc` は 24）。
- UI の文言は高校生にわかる、やさしい日本語で書く。

## データの流れ

```text
data/questions/*.csv ─┐                       ┌─ src/lib/site-data.ts（確認済みだけ・サンプルの出し分け）
data/textbooks/*.csv ─┼─ npm run data:csv ─→ JSON ─ npm run validate ─→ astro build ─┤
data/subjects.json / taxonomy.json ───────────────────────────────────┘                 ├─ HTML（科目・教科書・章・復習ページ）
                                                                                         └─ /data/q/N.json（問題を ID 順に300問ずつ分割）
                                                                                            /data/tb/<教科書ID>.json・/data/rv/<科目ID>.json
                                                                                            → 出題画面が必要な分だけ読む
```

## 主なファイル

| 場所 | 内容 |
| --- | --- |
| `src/site.config.ts` | サイト名・お問い合わせフォーム URL・サンプルを含めるか |
| `src/lib/public-settings.ts` | 公開設定（フォーム URL・AdSense・運営者名）を環境変数から読む |
| `src/components/AdSlot.astro` | 広告の枠（設定があるときだけ広告コードを出す） |
| `src/lib/range.ts` | 範囲（`r=1-3,4.2`）の解釈・短縮・日本語の説明 |
| `src/lib/params.ts` | 出題画面の URL パラメータ |
| `src/lib/select.ts` | 出題セット（重要度・苦手・出題数・出題順） |
| `src/lib/normalize.ts` | 入力モードの表記ゆれの吸収（ルールを足したら `tests/normalize.test.ts` も） |
| `src/lib/review.ts` | 縦割り・横割りのまとめ方 |
| `src/lib/stats.ts` / `records.ts` | 学習記録（苦手 = 最後にまちがえた問題）・マイ範囲・履歴 |
| `src/lib/site-data.ts` | ビルド時のデータ（公開する問題・教科書・復習のまとまり・分割ファイル） |
| `src/client/practice.ts` | 出題画面 |
| `src/client/range-builder.ts` | 教科書ページの範囲選び |
| `scripts/lib/convert.ts` | CSV の列の別名・値の読み取り（年・重要度・確認済み） |
| `scripts/lib/validate.ts` | データの検証 |

## 変更したら

```bash
npm run ci
```

（データ変換・検証 → テスト → 型チェック → ビルド → ビルド結果の確認。ベースパス付きでも確かめるなら `BASE_PATH=/rekishi-ichimon` を付けて build と check:dist を実行する。）

画面の動きを変えたら、Playwright でブラウザ確認もする（`npm run build && npm run test:e2e`。Playwright が必要）。ブラウザ確認は、公開している3冊の教科書を使い、問題数はビルドされたデータから数えるので、問題を足しても直す必要はない。
