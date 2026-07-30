# Development Log

## 2026-07-29 — Phase 1

### 実装内容

- Next.js App RouterとTypeScriptでローカルAIベンチマークアプリを新規作成した。
- Qwen 3.5、Granite 4.1 8B、Llama 3 8B Uncensored、Phi-4 Miniを設定ファイルで一元管理した。
- Next.js Route HandlerからOllamaの`/api/version`、`/api/tags`、`/api/generate`へ接続する構成にした。
- Ollama接続状態、バージョン、インストール済みモデル、サイズ、更新日時、利用可否を表示した。
- 共通プロンプト、System Prompt、Temperature、Seed、最大出力、コンテキスト長、実行回数、コールド／ウォーム、ストリーミングを設定できるようにした。
- 選択モデルを1件ずつ順番に実行し、進捗、完了、エラー、中止を表示した。
- 1モデルが失敗しても残りを続行し、ユーザー中止時はAbortSignalで現在の通信と残りの実行を停止する設計にした。
- Ollamaのナノ秒指標を秒・ミリ秒・tokens/secへ変換し、回答、設定、日時、done reason、エラーとともに比較表示した。
- `schemaVersion: 1`の結果JSONをブラウザからダウンロードできるようにした。
- 個人情報を含まないサンプルJSON、README、CONTRIBUTING、アーキテクチャ文書、環境変数例、Git除外設定を追加した。

### 設計判断

- ブラウザからOllamaへ直接接続せず、Node.jsランタイムのRoute Handlerを経由する。
- 1回のRoute Handler呼び出しは1モデル・1実行だけを担当し、複数モデルの逐次制御と中止状態はクライアントで管理する。
- ストリーミングONの場合もサーバーでNDJSONを集約し、Phase 1の比較UIには完了後の結果を返す。
- コールド実行では`keep_alive: 0`、ウォーム実行では`keep_alive: "5m"`を送る。OSやOllama内部のキャッシュを完全に消去する機能とは区別する。
- 結果はサーバーへ自動保存せず、ブラウザダウンロードを優先する。
- 外部AI API、データベース、認証、クラウドデプロイ、GitHub Pages、Codex Sites設定は追加しない。
- ライセンスは所有者確認が必要なため未設定とした。

### セキュリティ・プライバシー

- プロンプトや回答をログへ出力せず、Ollama以外へ送信しない。
- 結果JSONへPC名、ユーザー名、ローカルパスを含めない。
- `.env.local`と実測結果フォルダをGit管理対象外とした。
- Ollama URLへ認証情報を埋め込んだ設定を拒否する。

### 確認結果

- Node.js: `v24.14.1`
- npm: `11.11.0`
- コマンド検索ではOllama CLIを検出できなかったが、ローカルAPIへは接続でき、Ollama `v0.32.5`と指定4モデルのインストールを確認した。
- `npm run typecheck`: 成功
- `npm run lint`: 成功
- `npm test`: 10件すべて成功。ナノ秒変換、tokens/sec、保存JSON、入力検証、逐次順序、一部失敗後の継続、中止条件を確認した。
- `npm run build`: 成功。トップページは静的生成、Ollama・ベンチマークAPIは動的Route Handlerとして生成された。
- ブラウザで4モデルへ同じ短いプロンプトを順番に送り、Qwen、Granite、Llama、Phiの順に1件ずつ進み、4/4完了、各種Ollama指標、アプリ側経過時間が表示されることを確認した。
- Phi-4 MiniでストリーミングONの実行が完了し、最終指標を取得できることを確認した。
- 実行中に「中止」を押し、`ABORTED`として結果へ記録され、残りを実行しないことを確認した。
- 結果JSONのダウンロード操作後もエラー画面や表示崩れがないことを確認した。実測ファイルはリポジトリへ保存していない。
- 到達不能なローカルURLを一時指定し、未接続警告、実行ボタン無効化、接続先表示、エラーオーバーレイなしを確認した。一時設定は確認後に削除した。
- PC幅で横方向のはみ出しがないことを確認した。モバイル幅の実ブラウザ変更は検証環境がviewport変更を提供しなかったため、760px以下の1列CSSと横はみ出し防止をコード・ビルドで確認した。
- npmパッケージ取得時、通常実行はローカル証明書チェーンの`UNABLE_TO_VERIFY_LEAF_SIGNATURE`で失敗した。証明書検証を無効化せず、Nodeの`--use-system-ca`で依存関係を導入した。一時的なnpm設定ファイルは残していない。
- `npm audit --omit=dev`はNext.jsの推移依存で3件のhigh severityを報告した。PostCSSは監査時点で修正版なし、sharpは修正版ありと表示されたが、範囲外の自動`audit fix`や強制更新は行っていない。

### 既知の制約・Phase 2候補

- Phase 1では結果の永続化、自動採点、ランキング、標準ベンチマーク、グラフを実装しない。
- コールド実行は厳密なOSキャッシュ消去を保証しない。
- ストリーミング途中の文字列はリアルタイム表示せず、完了後にまとめて表示する。
- npm監査で報告されたNext.js推移依存のPostCSS・sharpについて、上流の修正版とNext.js更新を継続確認する必要がある。
- Phase 2候補: 実行履歴のローカルインポート、中央値・分散、ウォームアップ除外、環境情報の利用者確認付き入力、標準プロンプトセット、結果比較チャート。

## 2026-07-30 — Phase 2

### Phase 2の実装概要

- Phase 1互換の自由入力モードを維持し、版管理された8問から選択する「Phase 2問題セット」モードを追加した。
- 問題文、評価観点、期待する回答条件、配点、自動判定／手動評価の区分を実行前に表示する。
- 正答性、推論過程の確認可能性、指示・出力形式の遵守、自己訂正・検算、曖昧な依頼への対応、簡潔さを独立した評価項目として保存する。不要な思考ログの長さは加点しない。

### 変更したファイル一覧

- `package.json`
- `README.md`
- `LOG.md`
- `src/app/api/benchmark/run/route.ts`
- `src/app/globals.css`
- `src/components/benchmark-dashboard.tsx`
- `src/components/benchmark-form.tsx`
- `src/components/problem-selector.tsx`
- `src/components/result-table.tsx`
- `src/data/phase2-problems.ts`
- `src/lib/benchmark-document.ts`
- `src/lib/memo-nexus.ts`
- `src/lib/scoring.ts`
- `src/lib/sequential-runner.ts`
- `src/lib/validation.ts`
- `src/types/benchmark.ts`
- `tests/benchmark-document.test.ts`
- `tests/memo-nexus.test.ts`
- `tests/package-config.test.ts`
- `tests/phase2-problems.test.ts`
- `tests/scoring.test.ts`
- `tests/sequential-runner.test.ts`
- `tests/validation.test.ts`

### 実装した機能

- 「自由入力」と「Phase 2問題セット」の切り替え、および8問の問題選択。
- 問題ID、タイトル、完全な問題文、評価観点、期待条件、配点、問題セット版のアプリ内定義。
- 選択問題を複数モデルへ送信し、回答、thinking、エラー、処理時間、トークン数、tokens/sec、実行状態、実行順を比較表示。
- 文字数、厳密JSON構文・キー、指定語など客観条件だけの限定的な自動採点。
- 意味的な正答性などを「手動評価」として保持し、手動合計点を入力・保存するUI。
- `schemaVersion: 1`を維持したPhase 2結果JSON生成と、旧Phase 1 JSONの既定値補完による再読み込み。
- `benchmarkMode`、問題セット情報、問題情報、評価定義、answers、採点状態、自動点、手動点、実行順、完了日時の保存。
- Memo-Nexusの`title`、`date`、`items`、`trendSummary`形式への変換・ダウンロード。回答の引用符と改行は`JSON.stringify`でエスケープする。
- 実行中も現在までの結果JSONをダウンロード可能。

### Phase 1から反映した改善

- モデル単位の連続実行から、実行回数ごとのラウンドロビン方式へ変更した。
- `runNumber`が`executionCount`を超えるリクエストを拒否する。
- 完了、失敗、中止、未実行を区別し、結果JSONへ保存する。
- 実行結果を1件ごとにReact stateへ追加し、途中結果を失いにくい構成を維持した。
- ユーザー中止後の残タスクを`not_run`として結果へ追加する。

### 開発ポート3100への変更

- `package.json`の`dev`を`next dev -p 3100`へ変更した。
- READMEの開発URLを`http://localhost:3100`へ変更した。
- `tests/package-config.test.ts`でdevスクリプトの3100固定を検証した。

### 実行したテストコマンドと結果

- `npm run typecheck`: 成功。
- `npm run lint`: 成功。
- `npm test`: 最終実行は24件すべて成功。
- `npm run check`: 最終実行は成功（typecheck、lint、24テスト）。
- 初回の`npm run check`では、新規ランタイムimportの`.ts`拡張子不足により22件中2件が失敗した。`src/lib/benchmark-document.ts`のimportを修正後に再実行し、24件すべて成功した。

### ビルド結果

- `npm run build`: 成功。
- Next.js production build、TypeScript検査、8 workerでのページデータ収集・静的ページ生成まで完了した。

### 未実装事項

- Phase 2の必須範囲について未実装事項なし。

### 既知の制限・注意点

- 自動採点は客観的な形式条件だけを扱う。意味的な正答性、推論品質、自己訂正、曖昧さへの対応、簡潔さは人が確認する必要がある。
- 手動点は評価者が結果カードへ合計点を入力する方式で、評価者名や項目別手動点は保存しない。
- 実測にはOllamaと対象モデルが必要であり、この実装記録では自動テストとproduction buildを確認した。
- `phase2-problems-draft.json`はリポジトリ内に存在しなかったため、指定された8テーマを新規の版管理データとして作成した。
- Phase 2ブランチはThinking結果を表示・保存する要件を重複実装しないため、Thinking対応ブランチを土台にした積み上げブランチである。

### PR

- PR #4: https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/pull/4

## 2026-07-30 — PR #4 Memo-Nexus取り込み用比較メモJSONの修正

### 問題となっていた旧形式

- 旧形式はモデル1件につき`items`を1件生成し、問題文、評価説明、Phase 1の説明を各モデルの長い`content`文字列へ平坦化していた。
- 同じ問題文と説明がモデル数だけ重複し、Memo-Nexus上で複数モデルの回答、速度、採点状態を1件のメモとして比較しにくかった。
- `MemoNexusDocument`と`MemoNexusItem`はLocal-AI-Benchmark独自定義であり、Memo-Nexus本体の正式なインポート型との互換性を確認できていなかった。

### 新しい比較メモJSONの構造

- 1回のベンチマークにつき`items`を1件だけ生成する。
- `content`は、問題文、実行条件、結果比較表、モデル別回答・thinking・評価、評価基準、期待条件、比較上の注意を持つMarkdown比較メモとした。
- 問題文、実行条件、評価基準、期待条件はメモ全体へ1回だけ記載し、モデルごとに重複させない。
- 処理時間は秒・小数第2位、tokens/secは小数第2位へ整形し、nullは「未取得」、点数nullは「未採点」、実行状態は日本語で表示する。
- Phase 1の説明はモデル別本文から削除し、`trendSummary`へ1回だけ保持する。
- `metadata`にはbenchmarkId、問題セット情報、問題情報、評価定義、期待条件、modelCount、および全実行の構造化データを保存する。
- 各モデルのmetadataにはモデルID、表示名、runNumber、executionOrder、executionStatus、回答、thinking、error、開始・完了日時、正確な測定値、doneReason、自動点、手動点、scoringStatus、criterionScoresを保持する。
- 型名を独自形式と明確にする`BenchmarkMemoExportDocument`、`BenchmarkMemoExportItem`、`BenchmarkMemoModelExport`へ変更した。
- ダウンロードファイル名を`<実行日時>-<problemId>-memo-nexus.json`形式へ変更した。
- UIのボタン名を「Memo-Nexus取り込み用比較メモJSON」へ変更した。

### 重複を削除した内容

- 問題文。
- 実行条件。
- 評価基準と期待する回答条件。
- 評価上の共通注意。
- Phase 1から得られたフィードバック。

### 変更したファイル

- `README.md`
- `LOG.md`
- `src/components/benchmark-dashboard.tsx`
- `src/components/result-table.tsx`
- `src/lib/memo-nexus.ts`
- `src/types/benchmark.ts`
- `tests/memo-nexus.test.ts`

### 実装した機能

- 4モデルを含む場合も`items.length === 1`となる1ベンチマーク1比較メモ変換。
- Markdown表による全モデルの実行順、状態、処理時間、出力トークン、tokens/sec、自動点、手動点の比較。
- completed、failed、aborted、not_runの日本語表示。
- thinkingあり／なし、エラー、null測定値、長い回答、改行・引用符・バックスラッシュを安全に扱う変換。
- 本文用の丸めた測定値とmetadata用の元の精密値の両立。
- 実行日時、problemId、`memo-nexus`を含む安全なダウンロードファイル名。

### テスト結果

- `npm run check`: 成功。
- TypeScript: 成功。
- ESLint: 成功。
- Nodeテスト: 25件すべて成功。
- 4モデルでもitemsが1件、問題文の出現が1回、Phase 1説明の重複なし、全モデル名・回答、thinking有無、failed・aborted・not_run、null測定値、JSON再読込、metadata必須情報、丸め表示、metadata精密値、ファイル名を確認した。

### ビルド結果

- `npm run build`: 成功。
- Next.js production build、TypeScript検査、ページデータ収集、静的ページ生成まで完了した。

### Memo-Nexus本体の仕様確認結果

- Local-AI-Benchmarkリポジトリ内にはMemo-Nexus本体の正式なインポート型またはインポート処理が存在しなかった。
- 公開検索でも、今回の`title`、`date`、`items`、`trendSummary`構造に対応するMemo-Nexus本体の公式仕様を特定できなかった。
- このため正式互換形式とは断定せず、「Memo-Nexus取り込み用比較メモJSON」という表記と独自エクスポート型名を使用する。
- Memo-Nexus本体の型を利用した統合テストは実施していない。

### 未実装事項

- Memo-Nexus本体の正式なインポート型を用いた統合テスト。公式仕様または対象リポジトリの提供が必要。

### 既知の制限

- `title`、`date`、`items`、`trendSummary`の外枠は既存形式を維持しているが、Memo-Nexus本体への正式な取り込み互換性は未確認。
- Markdownの描画結果はMemo-Nexus側のMarkdownレンダラー実装に依存する。

## 2026-07-30 — Waypoint v0.4.0取り込みコード確認後の互換修正

### 確認できた取り込み仕様

- Memo-Nexus（アプリ表示名Waypoint）v0.4.0の実装コード提供を受け、JSON貼り付け取り込み処理を確認した。
- `parsePastedJson`は、ルートがオブジェクトで`items`が配列の場合にニュースJSONとして処理する。
- `validateItNewsJsonPayload`は`items`が空でないことを要求する。
- `buildItNewsNotes`はルートの`title`、`date`、`trendSummary`と`items`を使用して1件のメモを生成する。
- `normalizeItNewsItem`は各itemの`title`または`heading`を見出しとして読み、`summary`等を本文要素として読む。
- 旧エクスポートで使用していた`items[].content`と`items[].metadata`は、Waypoint v0.4.0のメモ本文生成では参照されない。

### 追加で判明した問題

- 直前の修正で1ベンチマーク1itemにはなったが、比較Markdownを`items[0].content`へ格納していたため、Waypoint v0.4.0へ貼り付けると比較本文が欠落する。
- 構造化metadataはエクスポートJSONには残るが、Waypoint側のメモ本文には展開されない。

### 互換修正

- 比較Markdownを、Waypoint v0.4.0が本文へ展開するルートの`trendSummary`へ格納した。
- `items`は1件を維持し、`items[0].title`へ問題タイトル、`items[0].summary`へ短い比較概要を格納した。
- `items[0].metadata.models`には従来どおり全モデルの正確な回答、thinking、エラー、測定値、採点情報を保持した。
- UIボタン名を、提供コードとの互換確認を反映して「Memo-Nexus用JSON」へ変更した。
- READMEをWaypoint v0.4.0の具体的な取り込み関数とデータ配置に合わせて更新した。

### 変更したファイル

- `README.md`
- `LOG.md`
- `src/components/result-table.tsx`
- `src/lib/memo-nexus.ts`
- `src/types/benchmark.ts`
- `tests/memo-nexus.test.ts`

### 統合テスト

- `tests/memo-nexus.test.ts`へ、Waypoint v0.4.0の`validateItNewsJsonPayload`、`buildItNewsNotes`、`normalizeItNewsItem`に相当する取り込み再現処理を追加した。
- JSON再読み込み後、`items`が1件で見出しが有効であることを確認した。
- Waypoint取り込み後の本文に結果比較表、全モデル名、全回答、thinking、各実行状態が残ることを確認した。
- `items[].content`へ依存しないことを確認した。
- 構造化metadataで元の精密値が失われないことを引き続き確認した。

### テスト・ビルド結果

- `npm run check`: 成功。
- TypeScript: 成功。
- ESLint: 成功。
- Nodeテスト: 25件すべて成功。
- `npm run build`: 成功。

### 互換性確認結果

- 提供されたWaypoint v0.4.0の貼り付けJSON取り込み処理との構造互換性を確認した。
- ファイル選択によるJSON取り込みでも、ルートの`trendSummary`は本文へ展開される。

### 未実装事項・既知の制限

- Waypoint v0.4.0のブラウザUIを実際に起動したE2E取り込みテストは実施していない。
- `metadata`はWaypoint v0.4.0のメモ本文へ展開されないため、正確な構造化データは元のエクスポートJSONを保管して参照する必要がある。
- Waypoint側の取り込み仕様が将来変更された場合は、対応バージョンを再確認する必要がある。
