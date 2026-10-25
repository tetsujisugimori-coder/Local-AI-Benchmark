"use client";

import { useEffect, useState } from "react";
import {
  createIntegrityManifest,
  createPublicBenchmarkDocument,
  DEFAULT_PUBLIC_DISCLOSURE,
  inspectPublicContent,
  publicBenchmarkFileName,
  serializePublicBenchmarkDocument,
  type PublicContentInspection,
} from "@/lib/public-benchmark";
import type {
  PublicBenchmarkDocument,
  PublicDisclosureOptions,
  PublicIntegrityManifest,
} from "@/types/public-benchmark";

const MAX_INPUT_BYTES = 2 * 1024 * 1024;

type ExportBundle = {
  document: PublicBenchmarkDocument;
  serializedDocument: string;
  fileName: string;
  manifest: PublicIntegrityManifest;
  serializedManifest: string;
  inspection: PublicContentInspection;
};

function downloadJson(fileName: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function PublicDataExport() {
  const [input, setInput] = useState<unknown>(undefined);
  const [inputText, setInputText] = useState("");
  const [fileName, setFileName] = useState("");
  const [inputError, setInputError] = useState("");
  const [blockedIssues, setBlockedIssues] = useState<string[]>([]);
  const [disclosure, setDisclosure] = useState<PublicDisclosureOptions>(
    DEFAULT_PUBLIC_DISCLOSURE,
  );
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [validationError, setValidationError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [previewReviewed, setPreviewReviewed] = useState(false);
  const [approved, setApproved] = useState(false);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);

  useEffect(() => {
    let active = true;
    if (!inputText || input === undefined) {
      return () => {
        active = false;
      };
    }

    void createPublicBenchmarkDocument({
      input,
      inputText,
      disclosure,
    })
      .then(async (document) => {
        const inspection = inspectPublicContent(document);
        if (inspection.blocked.length > 0) {
          if (active) {
            setBlockedIssues(inspection.blocked);
            setValidationError(
              "公開データに認証情報または秘密鍵の可能性がある内容を検出しました。該当する入力を除外してJSONを修正してください。",
            );
          }
          return;
        }
        const serializedDocument = serializePublicBenchmarkDocument(document);
        const outputFileName = publicBenchmarkFileName(document);
        const manifest = await createIntegrityManifest({
          fileName: outputFileName,
          serializedDocument,
        });
        const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
        if (active) {
          setBlockedIssues([]);
          setBundle({
            document,
            serializedDocument,
            fileName: outputFileName,
            manifest,
            serializedManifest,
            inspection,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setValidationError(
            error instanceof Error
              ? error.message
              : "公開用データを検証できませんでした。",
          );
        }
      })
      .finally(() => {
        if (active) {
          setProcessing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [input, inputText, disclosure]);

  const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    setInput(undefined);
    setProcessing(false);
    setInputText("");
    setFileName("");
    setInputError("");
    setBlockedIssues([]);
    setBundle(null);
    setPreviewReviewed(false);
    setApproved(false);
    setWarningsAcknowledged(false);
    setValidationError("");
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
      setInputError("JSONファイルを選択してください。");
      event.currentTarget.value = "";
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setInputError("入力できるJSONは2 MiB以下です。");
      event.currentTarget.value = "";
      return;
    }
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      setInput(parsed);
      setInputText(text);
      setFileName(file.name);
      setProcessing(true);
    } catch {
      setInputError("JSONを読み込めません。構文を確認してください。");
      event.currentTarget.value = "";
    }
  };

  const changeDisclosure = (key: keyof PublicDisclosureOptions) => {
    setBundle(null);
    setPreviewReviewed(false);
    setApproved(false);
    setWarningsAcknowledged(false);
    setValidationError("");
    setBlockedIssues([]);
    if (input !== undefined) {
      setProcessing(true);
    }
    setDisclosure((current) => ({ ...current, [key]: !current[key] }));
  };

  const canDownload =
    bundle !== null &&
    previewReviewed &&
    approved &&
    (bundle.inspection.warnings.length === 0 || warningsAcknowledged);

  return (
    <section className="panel publicExportPanel" aria-labelledby="public-export-title">
      <div className="sectionHeading">
        <div>
          <p className="stepLabel">MANUAL PUBLIC DATA</p>
          <h2 id="public-export-title">公開用データを作成</h2>
        </div>
      </div>
      <p className="sectionIntro">
        既存Ollama結果JSONまたは構造化CLI評価記録をローカルで検証し、
        <code>benchmark-public/v1</code>へ変換します。外部送信や公開は行いません。
      </p>

      <label className="field publicFileField">
        入力JSON
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => void selectFile(event)}
          aria-describedby="public-export-file-help"
        />
        <small id="public-export-file-help">
          schemaVersion 1のOllama結果、またはbenchmark-cli-record/v1を選択します
          （最大2 MiB）。
        </small>
      </label>
      <a className="publicTemplateLink" href="/cli-record-template.json" download>
        CLI評価記録JSONテンプレートをダウンロード
      </a>
      {fileName ? <p className="publicSourceName">選択中: {fileName}</p> : null}
      {inputError ? (
        <p className="formError" role="alert">
          {inputError}
        </p>
      ) : null}

      <fieldset className="publicDisclosure">
        <legend>公開データへ含める自由記述（初期状態では含めません）</legend>
        <label>
          <input
            type="checkbox"
            checked={disclosure.includeTaskPrompt}
            onChange={() => changeDisclosure("includeTaskPrompt")}
          />
          問題文・プロンプト
        </label>
        <label>
          <input
            type="checkbox"
            checked={disclosure.includeResponses}
            onChange={() => changeDisclosure("includeResponses")}
          />
          モデルの回答
        </label>
        <label>
          <input
            type="checkbox"
            checked={disclosure.includeEvidence}
            onChange={() => changeDisclosure("includeEvidence")}
          />
          評価・テストの証拠・未観測理由・制約メモ
        </label>
        <label>
          <input
            type="checkbox"
            checked={disclosure.includeJudgments}
            onChange={() => changeDisclosure("includeJudgments")}
          />
          評価者の判断
        </label>
        <label>
          <input
            type="checkbox"
            checked={disclosure.includeTestCommands}
            onChange={() => changeDisclosure("includeTestCommands")}
          />
          テストコマンド
        </label>
      </fieldset>

      <div className="warningAlert publicExportNotice" role="note">
        <strong>公開前に必ず確認してください</strong>
        <ul>
          <li>出力は手動で確認・承認した後にのみローカルへダウンロードできます。</li>
          <li>スキャナーは既知のパターンだけを検出し、秘密情報の不在を保証しません。</li>
          <li>未公開課題、正解パッチ、隠しテスト、生ログ、個人情報を含めないでください。</li>
          <li>ハッシュはファイル同一性の確認用であり、測定の正確性は証明しません。</li>
        </ul>
      </div>

      <div className="publicValidation" aria-live="polite">
        {processing ? <p role="status">入力を検証しています…</p> : null}
        {validationError ? (
          <p className="formError" role="alert">
            {validationError}
          </p>
        ) : null}
        {blockedIssues.length ? (
          <div className="formError" role="alert">
            <strong>出力を停止した項目</strong>
            <ul>
              {blockedIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {bundle?.inspection.warnings.length ? (
          <div className="warningAlert" role="alert">
            <strong>内容確認が必要な警告</strong>
            <ul>
              {bundle.inspection.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {bundle ? (
          <p className="publicValidationSuccess" role="status">
            スキーマ検証に成功しました。{bundle.document.experiments.length}
            件の記録をプレビューできます（種別: {bundle.document.dataKind}）。
          </p>
        ) : null}
      </div>

      {bundle ? (
        <>
          <details className="publicPreview">
            <summary onClick={() => setPreviewReviewed(true)}>
              公開対象のJSONプレビューを確認
            </summary>
            <pre>{bundle.serializedDocument}</pre>
          </details>
          <label className="switchField publicApproval">
            <input
              type="checkbox"
              checked={approved}
              disabled={!previewReviewed}
              onChange={(event) => setApproved(event.currentTarget.checked)}
            />
            <span>
              プレビューを確認し、公開可能な内容であることを承認します。
              <small>
                プレビューを開いた後に承認できます。承認はローカルファイルの作成のみを許可し、Web公開や送信は行いません。
              </small>
            </span>
          </label>
          {bundle.inspection.warnings.length ? (
            <label className="switchField publicApproval">
              <input
                type="checkbox"
                checked={warningsAcknowledged}
                disabled={!previewReviewed}
                onChange={(event) =>
                  setWarningsAcknowledged(event.currentTarget.checked)
                }
              />
              <span>
                警告箇所を個別に確認し、公開してよいことを判断しました。
              </span>
            </label>
          ) : null}
          <div className="publicDownloadActions">
            <button
              type="button"
              className="primaryButton compactButton"
              disabled={!canDownload}
              onClick={() =>
                downloadJson(bundle.fileName, bundle.serializedDocument)
              }
            >
              公開用JSONをローカル保存
            </button>
            <button
              type="button"
              className="secondaryDownloadButton"
              disabled={!canDownload}
              onClick={() =>
                downloadJson(
                  `${bundle.fileName}.manifest.json`,
                  bundle.serializedManifest,
                )
              }
            >
              SHA-256 manifestをローカル保存
            </button>
          </div>
        </>
      ) : null}

      <p className="scoringNotice publicExportFootnote">
        変換は許可項目の射影のみを行い、元JSONの任意項目やThinking、生ログは複製しません。
        公開ファイルは人間が別途確認してください。
      </p>
    </section>
  );
}
