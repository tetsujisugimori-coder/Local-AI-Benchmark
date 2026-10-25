# Draft PR #11 独立レビュー（2026-10-26 JST）

- 対象: [PR #11](https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/pull/11) / [Issue #9](https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/issues/9)
- レビュー対象HEAD: `b89fb0c2612648c8d8c5f4f3168a8b46df10bde5`
- 総合判定: **HOLD（P1 2件、P2 2件。修正・再レビューまでDraft維持）**
- 調査範囲: GitHub上の実装コード、仕様、PR差分、検証報告、Actions結果の静的照合。指摘した不具合の独立動的再現・WebKit検証は未実施。

## 確認できた成果

- `viewer/`に独立したNext.js静的ビューアが追加され、既存Ollamaアプリとはビルドを分離している。
- 公開JSON/manifestの形式・SHA-256照合、検索、選択比較、ブラウザ内一時読み込み、手動登録CLIが実装されている。catalogは合成サンプルのみ。
- 評価基準説明の相違を比較不可、未公開説明を不明とする修正と単体テストが含まれている。
- PRの報告では `npm run check` 60/60、両build、viewer:validate、Edge headless検証成功。GitHub Actions [run #40230474281](https://github.com/tetsujisugimori-coder/Local-AI-Benchmark/actions/runs/40230474281) は上記HEADで成功している（確認済み）。
- 実測データの公開と自動デプロイは対象外。CI成功を安全性・計測妥当性の証明とは扱わない。

## 指摘

### P1-1：未登録の非JSONファイルが静的公開物に混入し得る

- 対象: `scripts/validate-public-viewer.mjs`
- 出力内の未登録 `.json` は拒否するが、他の拡張子のファイルは限定的な禁止名・禁止文字列検査だけであり、`viewer/public/`から静的出力へコピーされた予期しない `.txt` / `.csv` などを網羅的に拒否できない。
- リスク: 手動公開前に意図しないファイルを配布対象へ含めたまま `viewer:validate` が成功し得る。
- 修正条件: `viewer/public/`および静的出力を、既知のNext.js生成物と登録済みcatalog・JSON・manifest等の明示的な許可セットに基づき検査する。未知ファイル・未知拡張子・追加の未登録ファイルを拒否し、ネスト・symlinkも考慮する。
- 回帰: `public/`へ未登録 `.txt` / `.csv` / 不明なJSONを置いた場合と、出力へ余分なファイルを置いた場合に失敗することを確かめる。

### P1-2：課題本文・エージェント実行条件の差が比較判定に反映されない

- 対象: `viewer/src/lib/viewer-data.ts` の `assessComparability()`
- 現行は課題ID・セットID・版、採点規約・評価項目、`conditions.settings`、主要ハードウェア等を比較するが、`task.prompt`、`agent.tools`、`agent.permissions`、`agent.humanIntervention` の一致・不明を評価していない。
- リスク: 課題文や許可ツール・人間の介入が異なっても、差として検出されず、比較可能性を過大評価する。
- 修正条件: 公開された課題本文が違えば「直接比較不可」、未公開/未観測なら「不明」とする。ツール・権限・介入条件も公開値の差と不明を表示する。公開されない情報を同一と推定しない。fingerprint `conditions.id` の一致を強制しない。
- 回帰: 課題本文のみ異なる場合、ツール・権限・介入条件のみ異なる場合、それぞれの未公開/未観測の場合、比較可能な既知条件が一致する場合を用意する。

### P2-1：合成サンプルの数値が「実測」グラフへ混入する

- 対象: `viewer/app/viewer.tsx` の `MetricCharts()`
- `synthetic_sample`にも数値の実行時間・得点がある。グラフ描画に`dataKind`の区別がなく、「実測ミリ秒」という説明のもとにサンプル値が表示され得る。
- リスク: 注意書きを見ない読者が合成例示値を実測ベンチマークとして解釈する。
- 修正条件: 合成サンプルと利用者記録を図上で明確に区別し、少なくとも「実測」と書かれた系列に合成値を含めない。混在時も誤認防止を維持する。
- 回帰: 合成のみ、利用者記録のみ、混在、未観測値の表示を確認する。

### P2-2：登録CLIで検証済みファイルを再読込している

- 対象: `scripts/register-public-benchmark.mjs` の `copyExclusive()`
- 最初に入力ファイルを読み取り・検証した後、コピー時に入力パスをもう一度読み込んでいる。
- リスク: 検証後に元ファイルが変更された場合、検証したバイト列と登録されるバイト列が異なり得る（静的コード上の競合余地）。
- 修正条件: 検証に用いたバイト列そのものを排他的に保存し、保存後にmanifestとの一致を再確認する。失敗時のロールバックと既存ファイル保護を維持する。
- 回帰: 検証後の元ファイル変更、コピー失敗、登録重複、catalog更新失敗の各ケースを扱う。

## 未確認事項と完了基準

- WebKitは未検証。375px / 390pxでファイル選択・比較・横幅・キーボード操作を追加確認したい。
- 4件の再現テストと修正後の回帰、`npm run check`、既存アプリbuild、`viewer:build`、`viewer:validate`、`git diff --check`、最終HEADのGitHub Actionsを確認する。
- 修正は既存のDraft PR #11で実施し、マージ・auto-merge・公開デプロイは人間の承認前に実行しない。
- レビュー記録を追加しただけのコミットは問題修正ではないため、判定はHOLDのまま。
