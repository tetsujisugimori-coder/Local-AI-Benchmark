# Local AI Benchmark

Ollama上の複数ローカルAIモデルへ同一プロンプトを順番に送り、回答、処理時間、トークン数、ロード時間、tokens/secを比較するローカルWebアプリです。

Phase 1互換の自由入力に加え、Phase 2では版管理された8問の問題セット、客観条件の限定的な自動採点、手動評価、Memo-Nexus取り込み用の比較メモJSON出力に対応しています。クラウドAI APIや結果の外部送信は行いません。

## 対応モデル

| 表示名 | OllamaモデルID |
| --- | --- |
| Qwen 3.5 | `qwen3.5:latest` |
| Granite 4.1 8B | `granite4.1:8b` |
| Llama 3 8B Uncensored | `danielshamaei93/llama3-8b-uncensored:latest` |
| Phi-4 Mini | `phi4-mini:latest` |

モデル定義は[`src/config/models.ts`](src/config/models.ts)で一元管理しています。

## 必要環境

- Node.js 20.9以上（推奨: 現行LTS）
- npm
- [Ollama](https://ollama.com/)が同じPCまたは信頼できるローカルネットワーク上で起動していること
- 選択モデルを実行できるメモリまたはVRAM

このアプリはNext.jsサーバーからOllamaへ接続します。ブラウザからOllamaへ直接通信しません。

```text
ブラウザ → Next.js Route Handler → Ollama API → ローカルモデル
```

## セットアップ

```bash
npm install
```

環境変数の雛形をコピーします。

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

`.env.local`:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_REQUEST_TIMEOUT_MS=300000
NEXT_PUBLIC_GITHUB_REPOSITORY_URL=https://github.com/tetsujisugimori-coder/Local-AI-Benchmark
```

`.env.local`はGit管理されません。接続先URLへユーザー名、パスワード、APIキーを埋め込まないでください。

## Ollamaとモデルの準備

Ollamaをインストールして起動した後、必要なモデルを明示的に取得します。

```bash
ollama pull qwen3.5:latest
ollama pull granite4.1:8b
ollama pull danielshamaei93/llama3-8b-uncensored:latest
ollama pull phi4-mini:latest
ollama list
```

アプリはモデルを自動ダウンロードしません。モデル提供者の利用条件と、必要なディスク・メモリ容量を事前に確認してください。

## 起動

開発サーバー:

```bash
npm run dev
```

ブラウザで `http://localhost:3100` を開きます。`npm run dev`は常に3100ポートを使用します。

本番ビルドとローカル起動:

```bash
npm run build
npm start
```

## ベンチマークの実行

1. ヘッダーが「接続済み」になり、Ollamaバージョンが表示されることを確認します。
2. インストール済みモデルを1つ以上選択します。
3. 「自由入力」または「Phase 2問題セット」を選びます。Phase 2では問題文、評価観点、期待条件を実行前に確認します。
4. 自由入力の場合は全モデルへ送る共通プロンプトを入力します。Phase 2の場合は8問から1問を選択します。
5. System Prompt、Temperature、Seed、最大出力、コンテキスト長、実行回数、コールド／ウォーム、思考モード、ストリーミングを設定します。
6. 「ベンチマーク開始」を押します。

モデルは実行回数ごとのラウンドロビン順で1件ずつ実行されます。1モデルが失敗しても、ユーザーが中止していない限り残りのモデルを続行します。

- コールド: 各回答後に`keep_alive: 0`を送り、モデルをアンロードします。
- ウォーム: `keep_alive: "5m"`でモデルを保持します。
- 思考モード: 初期値はOFFです。ONの場合、対応モデルの`thinking`を最終回答と分けて保存・表示します。非対応モデルでは通常回答へ自動的にフォールバックします。
- ストリーミングON: OllamaのNDJSONをサーバー側で集約し、比較結果は完了後に表示します。

コールド実行は「次の呼び出しをロードが必要な状態に近づける」設定です。OSやOllamaのキャッシュを完全に消去するものではありません。

## 結果JSON

実行開始後に「結果JSON（途中結果含む）」を押すと、`schemaVersion: 1`のJSONをブラウザから保存できます。中止時は完了・失敗・中止・未実行を区別します。旧Phase 1 JSONとの後方互換性を保ち、自動保存、外部送信、GitHubへの自動投稿は行いません。

Phase 2結果では、問題セットID・版、問題ID・タイトル、評価観点、実行順、採点状態、自動点、手動点、完了日時を追加します。

「Memo-Nexus取り込み用比較メモJSON」は、1回のベンチマークを`items`内の1件のMarkdown比較メモとして出力します。問題文、実行条件、評価基準は1回だけ記載し、複数モデルの測定値を比較表へ、回答・thinking・採点内容をモデル別セクションへまとめます。全モデルの正確な測定値、回答、エラー、採点情報は構造化された`metadata.models`にも保持します。

外枠は`title`、`date`、`items`、`trendSummary`です。ただし、このリポジトリおよび公開情報からMemo-Nexus本体の正式なインポート型を確認できていないため、正式互換形式とは断定していません。回答中の引用符、改行、バックスラッシュはJSON文字列として正しくエスケープされます。

## Phase 2問題セットと採点

問題セットは[`src/data/phase2-problems.ts`](src/data/phase2-problems.ts)で一元管理しています。

1. 推論過程の検証
2. 文字数制限付き要約
3. JSON形式の厳密さ
4. 曖昧な依頼への対応
5. 自己訂正・検算
6. 複数指示の遵守
7. JavaScriptの原因説明
8. 8Bと80Bの実用比較

文字数、JSON構文、指定語の有無など機械的に確認できる条件だけを自動判定します。意味的な正答性、推論過程の確認可能性、曖昧な依頼への対応、簡潔さなどは「手動評価」として保存します。自動判定できない内容を無理に正解・不正解へ分類せず、不要なthinkingの長さは加点しません。

実測結果をプロジェクト内へ移動する場合、以下は`.gitignore`で除外されています。

- `results/`
- `benchmark-results/`
- `.local-data/`

個人情報を含まない形式例は[`examples/sample-result.json`](examples/sample-result.json)にあります。

## 取得する指標

Ollama Generate APIの以下の値を保存します。時間値はOllama仕様どおりナノ秒としてJSONへ保持し、画面では秒・ミリ秒へ変換します。

- `total_duration`
- `load_duration`
- `prompt_eval_count`
- `prompt_eval_duration`
- `eval_count`
- `eval_duration`
- `done_reason`
- 最終回答（`response`または`message.content`）
- 思考過程（`thinking`または`message.thinking`）
- アプリ側のリクエスト経過時間
- 入力処理速度・出力生成速度（tokens/sec）

## 品質確認

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

一括確認:

```bash
npm run check
```

## トラブルシューティング

### Ollamaへ接続できない

- Ollamaがインストール・起動しているか確認してください。
- `curl http://localhost:11434/api/version`を実行してください。
- `.env.local`の`OLLAMA_BASE_URL`を確認し、Next.jsを再起動してください。
- 別PCのOllamaへ接続する場合は、信頼できるLAN内だけで利用し、Ollama側の待受・ファイアウォール設定を確認してください。

### モデルが未インストールと表示される

`ollama list`で正式なモデルIDを確認し、必要なモデルを`ollama pull <model-id>`で取得してください。

### タイムアウトする

初回ロードには時間がかかります。`.env.local`の`OLLAMA_REQUEST_TIMEOUT_MS`を増やし、Next.jsを再起動してください。

### 一部モデルだけ失敗する

結果カードのエラー分類を確認してください。メモリ不足、モデル読み込み失敗、未インストールはほかのモデルと区別して表示されます。

## ローカル実行限定の理由

ベンチマーク実行には、利用者のPCで動作するOllama APIへのサーバー側接続が必要です。Codex Sites、GitHub Pagesなどの静的ホスティングだけでは測定部分は動作しません。Vercelなどの公開サーバーから利用者の`localhost`へ接続する設計にもしていません。

将来、説明ページや匿名化済みサンプル結果の閲覧専用画面だけを静的公開する余地はありますが、Phase 1の実行機能はローカル専用です。

## セキュリティとプライバシー

- Ollama以外のAI APIを使用しません。
- プロンプトや回答を外部サービスへ自動送信しません。
- 入力内容をサーバーログへ出力しません。
- 結果JSONへPC名、ユーザー名、ローカルパスを追加しません。
- 実測結果をGitHubへ自動pushしません。

## ライセンス

ライセンス未設定です。`LICENSE`を追加する前に、プロジェクト所有者の確認が必要です。
