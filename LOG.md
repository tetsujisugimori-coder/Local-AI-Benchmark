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

## 2026-10-25 — CLI Coding Agent比較研究基盤 第0段階

### 事前調査

- 作業開始時の`main`と`origin/main`は`fb26c73b23238e58cfa0a5caef03a02142f89c77`で一致し、作業ツリーはクリーンだった。
- remoteは`origin`（`tetsujisugimori-coder/Local-AI-Benchmark`）。
- 既存Issue #1、#2はOpen、PR #3、#4はMerged。研究基盤の追跡Issueとして[#5](https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/issues/5)を作成した。
- README、LOG、CONTRIBUTING、`.gitignore`、`package.json`、`tests/`を確認した。テストはNode.js test runnerを使用し、既存の`npm run check`はtypecheck・lint・testを実行する。

### 実装内容

- 既存Ollamaベンチマークとは独立した`research/cli-agents/`研究領域を追加した。
- 共通実験規約、8項目の評価基準、実験記録テンプレート、ローカル隔離と公開前確認手順を文書化した。
- Calculator Memo Issue #79 / Draft PR #80は、指定SHA、PARTIAL結果、情報汚染と盲検性の制約、および元リポジトリへのリンクだけを公開記録に登録した。パッチ・正解情報は複製していない。
- READMEに研究領域への案内を追加した。既存の`.gitignore`にある`/.local-data/`規則が対象パスも除外するため、重複する専用規則は追加していない。
- エージェント競争、修正、採点は実施していない。

### 変更対象と影響範囲

- `README.md`、`LOG.md`
- `research/cli-agents/README.md`
- `research/cli-agents/protocols/`の評価規約、実験記録テンプレート、ローカル隔離手順
- `research/cli-agents/cases/`と`research/cli-agents/reports/`のCalculator Memo概要記録
- 既存アプリ、Ollama接続、採点ロジック、依存関係への変更なし。

### 検証

- `npm run check`: 成功。TypeScript検査、ESLint、25テストすべて成功。
- `npm run build`: 成功。Next.js production build、TypeScript処理、静的ページ生成が完了。
- PythonのMarkdownリンク検査（README、LOG、研究資料8文書）: ローカルリンク16件を確認し、全参照先が存在。
- `git check-ignore -v .local-data/cli-agents/answer-key/example.patch`: 既存の`/.local-data/`規則で除外されることを確認。重複する専用規則は追加していない。
- `.local-data/cli-agents/`配下を`git ls-files`で確認: 追跡ファイルなし。隔離用ディレクトリのみ作成し、秘密資料は置いていない。
- `git diff --check`、`git diff --cached --check`: 成功。
- `git ls-tree -r --name-only HEAD .github`: 現在の基準HEADにGitHub Actions設定ファイルは見つからなかった。Draft PR作成後もPR checksを確認し、未設定ならその旨を記録する。
- 検証時の作業ツリーでは意図した`README.md`、`LOG.md`、`research/`だけが変更対象。既存アプリのソース、依存関係、Ollama処理、採点ロジックに変更なし。
- `git diff --check origin/main...HEAD`: push後のPR差分で成功。PR差分は上記8文書のみで、`.local-data/cli-agents/`内のファイルは含まれない。
- `gh pr view 6 --json ...`: PR #6はDraft / OPEN。PRのファイル一覧は意図した8文書のみ。
- `gh pr checks 6`: `no checks reported`（終了コード1）。`statusCheckRollup`も空で、実行されたCI checkはない。CI成功とは扱わない。

### 未確認事項

- この段階ではエージェントの隔離実行、盲検実験、修正後テスト、独立採点は実施しない。
- CI workflowが設定されていないため、GitHub上のビルド・テスト・artifact検査は未実行。ローカルの`npm run check`と`npm run build`を確認済み。

## 2026-10-25 — 共通公開ベンチマーク形式と手動エクスポート（第1段階）

### 作業前調査

- `main`と`origin/main`の基準HEADは`7b09f02bc5e877b82d6699b62d5fdec64e356355`。作業開始時の作業ツリーはクリーンで、専用ブランチ`feature/public-benchmark-export`を作成した。
- 第0段階Draft PR #6は既にMerged。変更・再利用せず、最新mainを基点とした。作業Issue [#7](https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/issues/7)を作成した。
- Ollama `BenchmarkDocument` schemaVersion 1、既存採点処理、JSON出力、Memo-Nexus連携、テスト・build設定を確認した。既存JSON型、実行処理、採点処理、Memo-Nexus形式、依存関係は変更していない。
- `origin/main`にGitHub Actions workflowはなく、GitHub上のCI実行結果は存在しない。

### 実装

- `benchmark-public/v1`を既存形式から独立させ、Ollama schemaVersion 1と構造化`benchmark-cli-record/v1`のallowlist変換、検証、合成サンプルを追加した。
- CLI評価記録テンプレートと第0段階Markdown記録との対応を文書化した。評価点・ゼロ・N/O・N/A、実行状態、評価不能、汚染状態を分離し、未実行を成功・失敗や実測値として扱わない。
- 自由記述の初期出力を抑止し、問題文、回答、評価・テスト証拠と未観測理由・制約、評価者判断、テストコマンドを個別選択可能にした。既知の秘密パターンは停止し、PII候補は警告する。人間によるプレビュー確認と承認後にのみJSONとSHA-256 manifestをローカル保存する。外部送信・公開・CLI自動実行はない。
- 未知の実験条件キーを拒否し、条件IDをキー順に依存しない正規化データから生成する。出力manifestを検証する`verifyIntegrityManifest`も追加した。SHA-256はファイル同一性のみを確認し、測定の正確性を証明しない。
- 独立レビュー指摘（未選択の未観測メモ出力、未実行試行の失敗判定、条件IDのキー順依存）を修正し、回帰テストを追加した。

### 変更範囲

- `src/types/public-benchmark.ts`、`src/lib/public-benchmark.ts`
- `src/components/public-data-export.tsx`、`src/components/benchmark-dashboard.tsx`、`src/app/globals.css`
- `tests/public-benchmark.test.ts`
- `public/cli-record-template.json`、`examples/sample-cli-record.json`、`examples/sample-public-benchmark.json`、`examples/sample-result.json`
- `docs/public-benchmark-format.md`、`README.md`、`research/cli-agents/README.md`、`LOG.md`
- npm依存追加なし。既存Ollama、採点、schemaVersion 1読込・出力、Memo-Nexusのソース変更なし。

### 検証と結果

- `npm run check`: 成功。TypeScript、ESLint、Nodeテスト37件すべて成功。
- `npm run build`: 成功。Next.js production build、TypeScript処理、静的ページ生成が完了。
- 合成公開サンプル: `validatePublicBenchmarkDocument`で検証し、秘密パターンスキャンはblock 0件・warning 0件。
- Chromium/Edge 156.0.4314.42でproduction UIを375pxと390pxの各ビューポートで操作。両幅とも`scrollWidth`はviewport幅と一致し、JSON取込・スキーマ検証・プレビュー、承認前ダウンロード無効、Tab/Spaceによる承認後ダウンロード有効を確認した。
- 同じブラウザ操作で承認後の公開JSONとmanifestを一時ディレクトリへダウンロードできることを確認し、検証後に一時ファイルを削除した。
- PythonのMarkdown相対リンク検査（README、研究README、公開形式仕様）: 全参照先が存在。
- `git diff --check`: 成功。既存の`.gitignore`規則`/.local-data/`が`.local-data/cli-agents/`を除外し、`git ls-files .local-data`は空。秘密資料は配置していない。
- WebKit実行環境は利用できず、WebKit検証は未実施。Playwright/Puppeteerも依存にないため追加していない。
- GitHub Actions workflowがないためCIは未確認。Draft PR作成後の`gh pr checks 8`は`no checks reported`（終了コード1）で、GitHub CI結果は存在しない。CI成功とは扱わない。

### 未実施・制約

- 実ベンチマーク、CLIエージェントの自動実行、外部送信・Web公開は実施していない。
- 秘密パターン検出は完全な漏えい防止を保証せず、公開前のプレビューと人間による確認を必須とする。
- WebKitおよびGitHub CI checksは未確認。PRはDraftのままとし、マージ・auto-merge・本番公開を行わない。

### GitHub作業結果

- Issue [#7](https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/issues/7)を追跡用として使用した。
- 専用ブランチ`feature/public-benchmark-export`をpushし、[#8](https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/pull/8)をbase `main`のDraft PRとして作成した。
- 実装コミット`551419755929f52a1c5190173dd2dc4520e41bf7`を含む最終PR HEADについて`gh pr checks 8`を実行したが、`no checks reported`（終了コード1）。GitHub CIは未実行・未確認。
- PR #6はMergedのまま変更していない。PR #8はDraft / OPENで、merge、auto-merge、本番公開は行っていない。

## 2026-10-25 — Draft PR #8 独立レビュー指摘修正

### 作業開始時の状態

- `git fetch origin`後、作業ブランチと`origin/feature/public-benchmark-export`は`ad68632f3b704146b510f346f131e007fed493a5`で一致。`origin/main`は`7b09f02bc5e877b82d6699b62d5fdec64e356355`。作業ツリーは開始時cleanで、競合・先行リモート更新なし。
- 既存Draft PR #8を更新する対象として確認。main、Issue #7、PR #6、Ollama実行・既存採点・Memo-Nexus出力は変更しない。

### 修正内容と再現確認

- 公開射影を識別子、エージェント詳細、環境情報、参照URL、自由記述の明示選択で制御。未選択のCLI評価項目IDは`criterion-N`へ置き換え、Ollama/CLIの評価規約ID・版も既定で隠す。証拠参照URL、権限説明、人間介入、公開参照も選択されない限り複製しない。ライブラリの直接呼出しとシリアライズでも確認した。
- URL資格情報・機密クエリ・非公開IPv4/IPv6・ローカル/内部ホストを検査。選択済み文章中の内部IP URLもシリアライズをブロックする。通常URLや個人情報候補は警告にとどめ、UIで人間の警告承認とプレビュー承認の両方を要求する。DNS解決やURLの公開状態は検査できない。
- 既存Ollama seedの有限な負値を維持し、benchmark IDの日時・オフセットを含む実験IDはSHA-256由来の安全な形式に変換。通常、Phase 2、UTC、`+09:00`形式、重複IDを回帰検証した。
- CLI規約は`cli-agent-evaluation@1.0.0`の組み合わせで既知8項目と各4点上限を検証。全規約で評価項目ID重複を拒否し、未知規約へ既知8項目を強制しない。0点、N/O、N/A、`not_run`の区別を保持する。
- `conditions.id`を実験前のモデル・エージェント・環境・条件設定から正規化して算出。キー順、開示選択、評価証拠・判断、介入記録に依存せず、実行設定変更で変わることを確認。公開サンプルは新しい決定的IDで再生成し、`synthetic_sample`を維持した。
- 非同期ファイル読込に世代管理を追加し、古い成功・失敗結果を無視。新規入力や公開選択の変更でプレビュー承認を解除し、検証中はダウンロード不可とした。
- 独立レビューでは追加で「未選択の評価項目/規約IDの漏えい」と「文章中のprivate IPv4 URLが警告のみ」の2点を指摘。上記の公開射影・スキャナー変更と回帰テストで修正した。
- Edge実機操作で警告表示時に375px幅の横溢れを再現し、公開パネルの最小トラック幅と警告文の折返しを修正。最終確認では375pxと390pxの両方でviewport幅とscroll幅が一致した。

### 変更ファイル

- `src/lib/public-benchmark.ts`、`src/lib/latest-selection.ts`、`src/types/public-benchmark.ts`
- `src/components/public-data-export.tsx`、`src/app/globals.css`
- `tests/public-benchmark.test.ts`（既存12件から18件へ6件追加）
- `examples/sample-public-benchmark.json`、`docs/public-benchmark-format.md`、`README.md`、`LOG.md`

### 検証結果

- 修正前の再現では、公開ベンチマークの集中テスト17件中14件成功・3件失敗。未選択の内部情報漏えい、CLI規約検証不足、事後介入による条件ID変化を確認した。seed/日時のテストは当初変換だけだったため、後に公開形式検証・シリアライズ・重複IDまで検証する回帰ケースに強化した。
- 最終`npm run check`: 成功。TypeScript、ESLint、全43テスト成功（失敗0）。
- 最終`npm run build`: 成功。Next.js production build、型処理、静的ページ生成を完了。
- `git diff --check`: exit 0。生成サンプルに対するGitのLF→CRLF変換注意のみで、空白エラーなし。
- Edge 156 production UI: 375px/390px、JSON取込、ファイルAの読込遅延中にファイルBを選択して最新Bを採用、開示選択変更による承認解除、email警告と警告承認ゲート、キーボードSpaceによる操作、公開JSONとmanifestのローカルダウンロードを確認。警告状態の最終レイアウトも375px/390pxで横溢れなし。合成入力を使用。
- SHA-256 manifest照合と改変検出、`synthetic_sample`維持、既存Ollama schemaVersion 1/Memo-Nexus関連を含む全テストを確認。
- WebKitは実行環境がなく未検証。GitHub Actions workflowがないためCIは未確認（`no checks reported`は成功扱いしない）。

### 残存制約

- URL/秘密情報検出は完全ではなく、DNS解決、URL所有者・公開状態、課題やリポジトリの秘密性は判断できない。出力前の原文・プレビューの人間確認を必須とする。
- CLIエージェントの実行、外部送信・公開、WebKit検証、GitHub CIは実施していない。

## 2026-10-25 — Draft PR #8 第2回独立レビュー指摘修正

### 作業開始時の状態と修正前再現

- 作業対象は`feature/public-benchmark-export`のレビュー対象HEAD `253d523feb4621803705bba5279df40d5e3b607d`。`origin/main`は`7b09f02bc5e877b82d6699b62d5fdec64e356355`。PR #8は既存Draftとして維持し、新規PRは作成しない。
- 修正前の回帰テストで、末尾ドット付きlocalhostが変換を通ること、`100.64.0.1`が非公開IPとして拒否されないこと、選択回答中の末尾ドット付き内部URLがブロックされないことを再現した。変更前の条件値正規化ルールでも、`provider/model@2026-01`と`provider/model@2026-10`がどちらも除外され、条件ID入力が衝突することを個別に確認した。
- 修正前に追加した最初のテスト実行は22件中18件成功・4件失敗。うち3件は上記の対象不具合、残る1件は新規テストの組み立てミスであり、修正してから最終テストを実施した。

### 修正内容

- URL分類を共通化し、末尾ドット・大文字小文字を正規化して、localhost/localdomain、内部 suffix、private/special-use IPv4、共有CGNAT、非public IPv6、IPv4-mapped IPv6を拒否する。Markdownリンク・autolink・文章末尾の句読点からURL部分を抽出し、参照配列だけでなく、公開された回答、証拠、評価者コメント、テストコマンド等の全公開文字列を走査する。内部・不正・認証付き・機密クエリURLはserializationを停止し、公開HTTPSは警告付きで人間確認へ進める。
- `conditions.id`は値を黙って削除せず、実行前識別情報をUnicode NFCへ正規化してハッシュ化する。オブジェクトキーはロケール非依存で整列し、意味上順序のない`tools`だけをコードユニット順で整列、他の配列順は保持する。URL・パス・資格情報らしい値、制御文字、512文字超は安全に扱えない条件として拒否する。評価・証拠・介入記録・公開選択は引き続き条件IDから除外する。
- `model.identified`は公開選択ではなく、元記録にモデル名とIDの両方が存在するかを表すよう変更。非公開状態は個々のObservationの`not_observed` reasonで区別し、v1の形状は維持した。
- 合成サンプルの`conditions.id`を同じ入力から決定的に再生成。`synthetic_sample`を維持し、CLI入力から生成したIDとの一致をテストする。

### 変更ファイル

- `src/lib/public-benchmark.ts`
- `tests/public-benchmark.test.ts`（7件追加。プロジェクト全体43件から50件へ）
- `docs/public-benchmark-format.md`
- `examples/sample-public-benchmark.json`
- `LOG.md`

### 検証結果

- 修正後の`node --test tests/public-benchmark.test.ts`: 25/25成功。
- `npm run check`: TypeScript、ESLint、全50テスト成功（失敗0）。
- `npm run build`: 成功。
- `git diff --check`: 成功。
- Edge 156 headless実ブラウザで375px/390pxを確認。合成CLIファイルの取込、長いURLを含む回答の開示、警告承認ゲート、キーボードによる開示選択変更後の承認解除、承認前ダウンロード禁止、ローカルJSON/manifestの保存、SHA-256照合、`synthetic_sample`維持を確認。別の合成入力にあるlocalhost末尾ドットURLでは出力プレビューとダウンロードを停止。画面幅の横溢れはなし。
- WebKitは未検証。GitHub CI状態はpush後に確認し、checksが存在しない場合は成功扱いしない。

### 残存制約とGitHub作業

- URLスキャナーはDNS解決・再バインド、URL所有者、公開許可、未検出の内部別名を完全には判断できない。条件IDのSHA-256は識別子の秘匿や実験の正確性を保証しない。プレビュー・原文の人間確認は必須。
- 作業中の再fetchでremoteにcommit `81e9137`（この第2回修正依頼文の記録のみ）が追加されたことを確認した。内容を確認し、作業を上書きせず履歴へ取り込む。
- 修正commit `4fe302a2119268b3c8b76fca36e804a57fa495c4`をremoteの`81e9137`上へrebaseし、force pushなしでpushした。既存PR #8本文へ第2回指摘の修正と検証結果を追記した。
- `gh pr view 8`ではbase `main`、state `OPEN`、`isDraft: true`、head `4fe302a2119268b3c8b76fca36e804a57fa495c4`を確認。`gh workflow list`は空で、`gh pr checks 8`は`no checks reported`（終了コード1）。CI成功とは扱わない。LOGの最終記録を追加後に再pushし、PR状態を再確認する。
- WebKit、GitHub Actions checksは未確認/利用不可。マージ、auto-merge、本番公開はしていない。

## 2026-10-25 — 公開ベンチマーク検証・登録・比較ビューア（第2段階）

### 作業前確認と構成

- 作業開始時の`main` / `origin/main`はPR #8のマージコミット`b1c0ca66d35c3fb268ef14c5c46aaf3dcb79c517`で一致し、作業ツリーはclean。Issue [#9](https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/issues/9)を作成し、専用ブランチ`feature/public-benchmark-viewer`を作成した。
- `viewer/`配下にNext.jsの独立した静的アプリを設けた。既存のNext.jsアプリ全体は静的exportへ変更せず、公開形式・manifest・参照URL検証の共有コードだけを再利用する。選定理由と分離境界を`docs/public-benchmark-viewer.md`に記録した。
- 登録済みデータはレビュー済みの合成サンプル1件のみ。実測データは追加していない。PR向けGitHub Actionsは`contents: read`のみで、デプロイ権限・秘密情報を持たない。

### 実装内容

- ブラウザ内の一時JSON/manifest選択とバイト単位のUTF-8・schema・SHA-256検証、公開カタログの再検証、モデル/エージェント等の検索・絞り込み、最大4実験の条件付き比較、実測値のみの棒グラフ、各実験の公開詳細・信頼性制約表示を実装した。一時読込はメモリ内だけで、アップロード・localStorage永続化・Ollama/API呼出しは行わない。
- 承認済みデータを人間が再検証してcatalogへ登録する補助CLIと、catalog・manifest・実験ID・静的成果物を検査する検証CLIを追加した。自動収集・commit・push・公開デプロイは実装していない。
- 実ブラウザ確認で375px/390pxに長い実験ID・評価項目がある場合、詳細・比較スコアがわずかに横へ溢れることを発見。詳細summaryとチャートの全列に折返し/最小幅制約を追加し、再確認でページ横幅とviewport幅が一致することを確認した。比較表の横幅超過は表専用の横スクロール領域内に留まる。
- `synthetic_sample`を一覧・詳細に明示し、合成データを実測性能の証拠として扱わない。異なる課題/規約を合算せず、conditions.id一致を比較要件にせず、未観測条件は不明・参考比較として表示する。

### 変更ファイル

- `.github/workflows/public-benchmark-viewer.yml`
- `viewer/`（独立静的アプリ、カタログ、合成データ、一覧・検索・比較UI、検証ロジック、CSS）
- `scripts/register-public-benchmark.mjs`、`scripts/validate-public-viewer.mjs`
- `tests/public-benchmark-viewer.test.ts`
- `src/lib/public-benchmark.ts`（既存の安全な公開URL判定を共有するexportのみ）
- `.gitignore`、`eslint.config.mjs`、`tsconfig.json`、`package.json`
- `README.md`、`docs/public-benchmark-format.md`、`docs/public-benchmark-viewer.md`、`LOG.md`

既存Ollama実行・採点・schemaVersion 1保存・Memo-Nexus出力のロジックは変更していない。依存パッケージを追加していない。

### 検証結果

- `npm run check`: 成功。既存アプリ/viewerのTypeScript、ESLint、Nodeテスト60件（成功60、失敗0）。
- `npm run build`: 成功。既存Next.jsアプリのproduction build。
- `npm run viewer:build`: 成功。静的ビューアをexport。
- `npm run viewer:validate`: 成功。catalog 1件・実験1件、静的成果物31ファイルを検査。
- `VIEWER_BASE_PATH=/Local-AI-Benchmark`を指定したサブパスbuildで、HTML内のasset URLがサブパス配下になることを確認。最終成果物は既定base pathで再buildした。
- Edge 156 headlessでproduction静的ファイルをlocalhost配信し、375px・390px・デスクトップ1280pxを確認。合成JSON/manifestの一時読込、SHA-256検証成功、モデル検索（3件中1件表示）、Spaceキーでの比較選択、複数実験比較、HTML風文字列がテキストとして表示され画像要素が実行されないこと、長い自由記述の折返しを確認した。ページの横幅は375px/390pxで一致し、横スクロールは比較表コンテナ内のみ。localStorageは0、観測したネットワーク要求11件は全てlocalhostで、API/Ollama/外部originへの要求なし。
- `git diff --check`: 成功。空白エラーなし（WindowsのLF/CRLF変換注意のみ）。
- WebKitは未検証。PR作成前につきGitHub Actionsの実行結果はまだない。PR後にchecksを確認し、未報告は成功扱いしない。

### セキュリティ境界と未確認事項

- SHA-256は選択されたJSONとmanifestの同一性だけを検証する。両ファイルを同じ人が変更可能な状況で真正性、実験の正確性、採点の独立性は保証しない。公開前の人間レビューが必要。
- 静的viewerに実測データ、秘密資料、ローカルAPI、環境変数は同梱しない。JSON文字列をHTMLとして実行せず、外部リンクは共有URL判定に従う。
- Edgeで行ったブラウザ検証はheadlessでのローカルproduction成果物確認。実利用者の支援技術、WebKit、GitHub CIの成功は確認していない。
- CIはworkflow定義を追加済みだがGitHub上の実行結果未確認。公開ホスティング、デプロイ、自動データ登録、実測結果の公開は実施していない。

## 2026-10-26 — Draft PR #11 独立レビュー指摘修正

### 作業前確認と修正前の再現

- 対象は既存ブランチ`feature/public-benchmark-viewer`。開始時に作業ツリーがcleanであること、PR #11のremote HEADにレビュー記録コミット`8ed60e544777d7a7041547364923543bfee85722`が含まれること、PRがOPEN/Draftであることを確認した。レビュー記録と先行修正を保持し、新規PR・main変更は行っていない。
- 修正前の静的検査CLIでは、`viewer/public`へ未登録CSV、静的出力へ未登録TXTを置いても検査が成功することを再現した。
- 修正前の比較関数へ課題本文、ツール、権限、介入条件だけが異なる記録を渡しても、それらの差が比較結果へ現れないことを確認した。
- 修正前のチャート実装は`dataKind`をグラフへ渡さず、合成サンプルも実測値のラベルで表示する構造だった（コード上で確認。修正前UIをブラウザ操作した再現ではない）。
- 登録競合はレビュー対象HEAD`8ed60e5`を一時展開した隔離ディレクトリで再現した。入力JSONの初回検証後、旧`copyExclusive()`が同じ入力パスを再読込するタイミングでファイルを変更すると、CLIは登録成功を表示したが、保存JSONと元manifestの照合に失敗した。隔離ディレクトリは再現後に削除した。

### 修正内容

- `viewer/public/`と`viewer/out/`を再帰的な許可リストで照合し、未知ファイル・ディレクトリ・symlink・非通常ファイルを拒否する。catalogと登録JSON/manifestの組、静的成果物とのバイト一致を維持。Next.js 16の通常のbuild-ID資産と空の対応ディレクトリは、build出力から確認できたものだけを許可する。
- 比較判定に`task.prompt`、`agent.tools`、`agent.permissions`、`agent.humanIntervention`を追加。課題本文や実行条件の非公開・未観測は一致扱いせず、toolの並び順だけは正規化する。
- メトリックを`dataKind`別に分け、`synthetic_sample`を例示専用の別系列として明示。利用者記録と混ぜず、未観測値も棒グラフのゼロにしない。
- 登録CLIは入力ファイルを一度だけ読み、その検証済みbytesを排他的に保存し、保存後のJSON/manifest・バイト一致を再検証する。catalog更新はロックで直列化し、既存ロック、catalog破損・変更、重複、保存失敗を拒否し、新規ファイルをrollbackする。中断時のstale lock確認・削除方法を運用文書へ追加した。
- 独立レビューで追加指摘されたエージェント実行インターフェース差（API/CLI/IDE等）を比較条件へ含め、相違時に直接比較不可とする回帰テストと仕様記述を追加した。
- 実ビルドでvalidatorの誤検出も発見した。Next.jsのbuild-ID資産は`_next/static/<id>/...`に出力される一方、同時に空の`_next/<id>`ディレクトリも作られる。資産の配置を正しく反映し、許可したbuild-IDに対応する空ディレクトリだけを許容する回帰テストを追加した。

### 変更ファイル

- `scripts/public-viewer-validation.mjs`（新規）、`scripts/validate-public-viewer.mjs`
- `viewer/src/lib/viewer-data.ts`
- `viewer/app/viewer.tsx`、`viewer/app/styles.css`
- `scripts/public-benchmark-registration.ts`（新規）、`scripts/register-public-benchmark.mjs`
- `tests/public-benchmark-viewer.test.ts`
- `docs/public-benchmark-viewer.md`
- `LOG.md`

### 検証結果

- `npm run check`: 成功。root/viewer TypeScript、ESLint、全75テストが成功（失敗0、skip 0）。Windows権限によりローカルsymlink作成テストのみ実行できず、診断を出した。Linux CIで同じ拒否ケースを実行するテストを残している。
- `npm run build`: 既存アプリproduction build成功。Ollama API routeを含む既存route構成でbuildできた。
- `npm run viewer:build`: 静的viewer build成功。
- `npm run viewer:validate`: catalog 1件・実験1件と、Next build assetsを含む静的出力31ファイルを検査し成功。
- `git diff --check`: 成功。
- Edge 156 headlessで静的viewerをローカル配信して確認。375px・390px・1280pxで表示し、375px/390pxはdocument幅とviewport幅が一致。合成JSON/manifestの一時読込とSHA検証、2実験の比較選択、Spaceキーでの選択、モデル検索フィルターを確認。合成値は例示専用として表示。観測要求34件はすべてlocalhostで、外部origin要求は0件。デスクトップはscrollWidth 1265px / viewport 1280pxで横方向のoverflowなし。
- 変更後の独立レビューでは実行インターフェース（API/CLI/IDE等）の比較漏れ1件が追加で見つかった。`agent.interface`を比較対象に含め、差があれば直接比較不可とするテスト・仕様記述を追加した。再実行した`npm run check`は75/75成功、root build、viewer build、viewer validate、`git diff --check`も成功。
- GitHub Actions run `40236624094`はLinux Next.js exportにのみ現れる`_not-found/__next._not-found.__PAGE__.txt`を未許可として検出。次のrun `40236829007`では、別の`_not-found/__next._not-found/__PAGE__.txt`がWindowsには存在するもののLinuxには存在しないため失敗した。両方を必須ファイルから外し、存在するときだけ受け入れる2件の正確なplatform-specific allowlistへ移した。未知の隣接ファイルを拒否する回帰テストを更新。
- 最終HEAD `4521bbbb7a06cc9e8db6a90ed5c44dab34528834`のGitHub Actions run `40236960190`は成功。Linux上で`npm ci`、`npm run check`、`npm run build`、`npm run viewer:build`、`npm run viewer:validate`をすべて完了した。Node.js 20 actionと`ubuntu-latest`更新の警告は残るがjob失敗ではない。
- WebKitは未検証。GitHub Actionsの最終HEAD CIはpush後に確認する。ローカルブラウザ試験は実験データを公開・登録していない。

### 残存事項

- URLや内容の安全性を完全に保証するものではない。reviewerによる静的成果物と公開データの確認は引き続き必要。
- `viewer/out`の許可リストはNext.js生成規則を意図的に固定している。Next.js更新時は生成出力を確認してからallowlistを更新する必要がある。
- WebKitおよびGitHub CIの最終結果は未確認。Draft PR #11は人間レビュー待ちで維持し、merge・auto-merge・本番公開は行わない。

## 2026-10-26 — Draft PR #11 追加レビュー指摘修正

### 作業前確認・修正前再現

- 作業開始時のブランチは`feature/public-benchmark-viewer`、作業ツリーはclean。ローカル・origin PR branch HEADはレビュー対象`1b803cae25304aec22626c72f41f342fd1abca86`で一致し、PR #11はOPEN/Draft、既存CI run `40237061931`は成功。mainへの変更や新規PRは行わない。
- 修正前の比較テストを追加して実行。12件中8件失敗した。既知のprompt不一致と未公開値が同時にある場合に差異が消える問題、複数条件で差異とunknownが両方存在する場合の誤分類、合成/利用者記録のdataKindを比較関数が受け取らない問題を再現した。全既知一致・部分未観測のみのケースは既存動作どおりだった。
- 登録処理へclose失敗を注入するテストを追加。修正前はJSON、manifest、catalog一時ファイルのclose失敗後に作成ファイルが残り、削除失敗も元のcloseエラーだけが返ってrollback失敗を示さないことを再現した。writeFile失敗系、排他衝突、正常登録は既存/追加テストで状態を確認する。

### 修正内容

- `compareObserved()`で既知値同士の不一致判定と、未観測値の検出を独立させた。既知不一致はunknownと同時に保持され、判定は直接比較不可を優先する。既知値が一致してunknownがある場合は参考比較、全件既知一致なら従来どおり直接比較可能。
- 比較入力に各recordの`dataKind`を渡すようビューアと比較関数を更新。従来のexperiment配列呼出しもuser_recorded扱いで後方互換維持。synthetic_sample同士は例示の参考比較、合成・利用者記録の混在は直接比較不可。課題/規約等の既知差やunknownはdataKind制約と併せて保持する。利用者記録の独立検証済み表現は追加していない。
- 登録ファイルのwrite/closeを両方確認し、いずれかが失敗すれば排他的に作成したファイルの削除を試行する。close失敗時もrollbackへ進む。削除も失敗した場合は`AggregateError`で元の失敗とrollback失敗を呼出し元に明示する。catalog lock、保存後manifest照合、元bytes使用、既存ファイル非上書きを維持する。

### 回帰と検証

- 修正前の新規比較・障害注入テスト: 最初の12件中4件成功・8件失敗（RED）。独立レビューで追加発見された設定・CPU・実行方式の混在ケースも、最小テストで修正前に参考比較へ誤分類されることを再現（RED）。全比較ケースは修正後GREEN、登録故障注入8ケースもGREEN。
- 設定・ハードウェア・実行方式についても、既知値の不一致判定とunknown検出を独立させた。各フィールドで既知の差と未観測を同時に表示し、直接比較不可を優先する回帰テストを追加。
- 最終`npm run check`: root/viewer typecheck、ESLint、88/88テスト成功（追加13テスト、失敗0、skip 0）。
- `npm run build`、`npm run viewer:build`、`npm run viewer:validate`、`git diff --check`はすべて成功。静的成果物はcatalog 1件・experiment 1件、31ファイルを検証した。
- Edge 156実ブラウザでproduction静的成果物をローカルNode HTTP server経由で確認。375px/390pxではdocument幅がviewport幅と一致、1280pxでは1265pxで横幅超過なし。検証用の一時JSON/manifestを使い、Spaceキーで選択した複数記録で既知の実行設定・CPU・実行方式の差と未観測条件を同時表示し、「直接比較不可」となることを確認。テスト用データは一時ファイルのみで、実測結果として登録・公開していない。観測HTTP要求はlocalhostのみで、外部通信なし。WebKitは未検証。
- 独立コードレビューで設定・CPU・実行方式の比較経路に同種のunknown優先問題を発見。修正前RED、修正後GREENを確認し、レビュー担当者が追修正を確認して関連する追加指摘なしと報告した。
- push後の最終HEADに対するGitHub Actionsは未確認。PR更新後に確認する。過去HEADに対するCI成功は今回の未push変更のCI成功を意味しない。

### 独立レビュー修正

- 独立レビューで、評価項目の説明文が比較判定から抜けており、採点定義が異なる結果でも直接比較可能になる中程度の問題を確認した。
- 評価項目ID・説明を個別に比較するよう修正。公開説明が異なる場合は直接比較不可、どちらかが非公開/未観測なら参考比較として不明点を表示する回帰テストを追加した。比較仕様書も更新した。
- 新しい回帰テストは最初、未観測説明の処理を配列全体として比較してしまう実装上の問題を検出した。各criterion IDごとに観測値を比較するよう修正し、`node --test --test-name-pattern="criterion description" tests/public-benchmark-viewer.test.ts`で1/1成功。
- 最終再検証後は`npm run check`が60/60成功、`npm run build`、`npm run viewer:build`、`npm run viewer:validate`、`git diff --check`がすべて成功。
- Draft PR作成後の最初のGitHub Actions run `40230185799`では`check`、root build、viewer buildは成功したが、Linux上の`viewer:validate`でmanifest SHA照合が失敗。原因はWindowsの`core.autocrlf`で合成JSONのCRLFがGit blobではLFになり、manifestが作業ツリー側のCRLFをhashしていたこと。
- `.gitattributes`で`viewer/public`内のJSONをLF固定し、catalog/合成JSON/manifestをLFへ正規化、manifestを実際のLF JSON bytesから再生成した。Git index上のsample bytesとmanifest SHA-256の一致、および`npm run viewer:validate`の成功を確認した。
- 修正HEAD`300dabf38bfbd9c38cbef1b716c8326020a0fac0`に対するGitHub Actions run `40230371597`は全step成功（npm ci、check、root build、viewer build、viewer validate）。先行run `40230185799`の失敗を修正した。RunnerからNode.js 20 action deprecationと`ubuntu-latest`移行の警告があったが、jobは成功。
