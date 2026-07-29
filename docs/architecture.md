# Phase 1 Architecture

## 通信経路

```text
Browser
  ├─ GET  /api/ollama/status
  └─ POST /api/benchmark/run
             ↓
       Next.js Node.js runtime
             ↓
       Local Ollama API
```

ブラウザはOllamaへ直接アクセスしません。CORS設定や公開APIキーは不要です。

## 責務

- `src/config/models.ts`: 比較対象モデル
- `src/types/benchmark.ts`: APIと保存JSONの型
- `src/lib/runtime-config.ts`: 環境変数の検証
- `src/lib/ollama-client.ts`: タイムアウト、中止、通常JSON・NDJSON応答
- `src/lib/metrics.ts`: ナノ秒変換とtokens/sec
- `src/app/api/ollama/*`: 接続状態、バージョン、モデル一覧
- `src/app/api/benchmark/run`: 1モデル・1回分の生成
- `src/components/benchmark-dashboard.tsx`: 複数モデルと実行回数の逐次制御

逐次制御をブラウザ側に置くことで、現在のモデル、全体進捗、中止を即時表示します。各生成自体はRoute Handlerを経由するため、Ollamaの接続先と通信処理はサーバー側に閉じています。

## エラー継続

Route HandlerはOllamaの実行エラーを`BenchmarkResult.error`へ変換します。ダッシュボードは結果を記録して次のモデルへ進みます。ユーザー中止の場合だけ、現在のリクエストをAbortSignalで停止して残りを実行しません。
