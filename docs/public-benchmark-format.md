# Public benchmark data format

## Version and compatibility

The publishing format is a separate, allowlisted projection:

```json
{
  "format": "benchmark-public/v1",
  "schemaVersion": 1,
  "dataKind": "user_recorded",
  "experiments": []
}
```

It does not replace or change the existing `BenchmarkDocument` `schemaVersion: 1` format, its reader/downloader, scoring behavior, or Memo-Nexus export. Import accepts the existing Ollama v1 document or the manual `benchmark-cli-record/v1` input record. Unknown formats and invalid statuses or values stop conversion.

`dataKind` is `user_recorded` for imported records and `synthetic_sample` only when the source explicitly carries `sampleRecord: true`. A user-recorded entry is not independently verified merely because it passed format validation.

## Experiment fields

Each experiment contains:

- `source`: input format and SHA-256 of the exact UTF-8 source JSON text.
- `task`: task/set identifiers and versions, title, and an optional public prompt.
- `time`: start/completion time and timezone as observations.
- `model`: name, ID, version, provider, selection method, and whether the actual model is identified.
- `agent`: name/version, API/CLI/IDE/cloud/other interface, available tools, permissions, and human intervention.
- `environment`: OS, CPU, GPU, memory, execution mode, and explicitly unavailable details.
- `conditions`: a stable identifier and the allowlisted run settings. It does not include credentials or a local Ollama base URL.
- `execution`: execution state, task outcome, scoring state and totals, optional response, durations, token counts, speed, cost, tests, completion/error codes, and evaluation limitations.
- `evaluation`: protocol ID/version and criteria with description, method, maximum score, score, evidence, unobserved items, assessor judgment, and public references.
- `contamination`: `none_detected`, `present`, or `unknown`, plus limitations. The scanner cannot establish that contamination did not occur.
- `publicReferences`: explicitly supplied HTTP(S) references without embedded URL credentials.

Measurements use tagged observations:

```json
{ "status": "observed", "value": 0 }
{ "status": "not_observed", "reason": "not measured" }
{ "status": "not_applicable", "reason": "not applicable to this run" }
```

Thus a measured zero is not confused with an unavailable value. Execution status (`completed`, `failed`, `aborted`, `not_run`) is separate from task outcome (`success`, `failure`, `indeterminate`, `not_applicable`) and scoring status. A not-run Ollama result has not-applicable measurements; an unscored or failed evaluation is not converted to a successful task outcome.

CLI manual scores retain the Phase 0 eight criteria and 0–4 point scale. Each score is a number, `not_observed`, or `not_applicable`; the two string states are never encoded as zero. The public format has no cross-task aggregate/ranking. Scores from different tasks, task-set versions, or protocols are not directly comparable.

## Ollama v1 mapping

The converter validates the v1 structure, then constructs a new object from specific fields; it never spreads the source document or arbitrary result properties.

| Existing field | Public representation |
| --- | --- |
| `benchmarkId`, `problemId`, `problemSetId`, `problemSetVersion`, `problemTitle` | Experiment/task identifiers and versions. Missing freeform problem metadata is `not_observed`. |
| `createdAt`, result `startedAt`, `finishedAt` | Experiment and run time observations, including timezone. |
| `displayName`, `modelId` | Identified Ollama model name/ID; model version remains not observed. |
| `environment.platform`, `cpu`, `memory` | Environment observations. Empty strings become `not_observed`; GPU/browser details stay unavailable. |
| `request` and per-result settings | Temperature, seed, token/context limits, execution count, run mode, streaming and thinking flags. System prompt and Ollama base URL are omitted. |
| `executionStatus`, `error.code` | Execution status and error code. Free-text error messages are omitted. |
| duration/count/rate fields | Observed values or explicit `not_observed`; a not-run result uses `not_applicable`. |
| scoring fields and evaluation criteria | Scores and rubric metadata; missing/pending scores are not observed, never zero. |
| response and request prompt | Excluded by default and included only when the matching disclosure checkbox is selected. |
| `thinking`, arbitrary extra properties | Never copied. |

The existing schema does not record independent test results, contamination, or human intervention. Those facts are explicitly unavailable/unknown, not inferred.

## Manual CLI JSON record

Download `/cli-record-template.json` from the export panel, fill one record per agent trial, remove the `template` marker, and import it. The accepted root format is `benchmark-cli-record/v1`; this is structured JSON input, not free-text log interpretation. CLI criteria must use `maxScore` 1–4 and a score from 0 through that maximum, `not_observed`, or `not_applicable`. Do not convert N/O or N/A to zero.

`model.selectionMethod` is `manual`, `automatic`, or `unknown`; it is distinct from whether both the actual model name and ID are known.

The condition-setting keys accepted for CLI input are `repositoryId`, `baseSha`, `timeLimitMinutes`, `temperature`, `seed`, `maxTokens`, `contextLength`, `executionCount`, `runMode`, `stream`, `think`, and `ollamaVersion`. Unknown keys are rejected rather than copied; add new public settings only through a reviewed schema change. Supply only a repository identifier that is safe to disclose.

The record fields correspond to the Phase 0 Markdown template as follows:

| Phase 0 Markdown heading/field | JSON field |
| --- | --- |
| experiment ID, task ID, task version, experiment date | `experiment.id`, `taskId`, `taskSetId`/`taskSetVersion`, `startedAt`/`completedAt`/`timezone` |
| agent and CLI version | `agent.name`, `agent.version`, `agent.interface` |
| model name/version/provider/selection | `model.*` |
| repository, base SHA, source identity, task instruction | `conditions.repositoryId` (public identifier only), `conditions.baseSha`, `experiment.taskPrompt` |
| OS, CPU, GPU, memory, browser, tools, permissions, human intervention | `environment.*`, `agent.tools`, `agent.permissions`, `agent.humanIntervention`; put unavailable observations in `environment.unavailable` |
| before/after test commands and outcomes | `execution.tests[]` |
| operation record and elapsed time | Record the measured total in `execution.durationMs`; do not paste raw logs |
| evaluation criteria 1–8, score, evidence, unobserved facts, assessor judgment | `evaluation.criteria[]` |
| information contamination and validity limitation | `contamination.status`, `contamination.limitations` |
| public evidence URLs | `publicReferences` and criterion `evidenceReferences` |
| items not verifiable | `execution.evaluationUnavailable` and criterion `unobserved` |

The first five non-contamination rubric dimensions retain the Phase 0 order; contamination is criterion 6, reproducibility is 7, and instruction/safety is 8. Keep evidence, unobserved facts, and assessor interpretation in their separate fields. The converter never interprets raw logs.

## Manual local export

1. Select an Ollama v1 result or a completed CLI JSON record in the **公開用データを作成** panel. Files are read in the browser and are limited to 2 MiB.
2. Select only the free-text fields that are intended for disclosure. Prompt, response, evidence, unobserved explanations, limitations, assessor judgment, and test commands default to excluded.
3. Review the validation result and open the JSON preview. A high-confidence credential/private-key match blocks output. A possible email or local-user path requires a separate warning acknowledgement.
4. Inspect every field in the preview. The scanner is heuristic and cannot identify all secrets, personal information, private repository content, or unreleased task material.
5. Check the explicit human approval and, when applicable, warning acknowledgement. Only then can the public JSON and its separate SHA-256 manifest be downloaded.

Download generation does not upload, publish, push, or save automatically. The application does not store the selected data. Human review is required even if automated scanning reports no warning.

## Integrity and reproducibility

`source.inputSha256` identifies the exact source JSON text. `conditions.id` is SHA-256 over the normalized model, agent, environment and condition settings. The separate `benchmark-public-manifest/v1` file hashes the exact UTF-8 bytes of the downloaded, formatted public JSON, including its final newline. The manifest is not embedded in that JSON.

Use `verifyIntegrityManifest` with the manifest JSON and exact downloaded JSON text to check byte identity; malformed manifests are rejected. This check does not establish how the data was measured or whether it is accurate.

SHA-256 can detect that bytes differ from the manifest's file. It does not prove that measurements, test claims, scores, provenance, or safety review are accurate. The same exact input and disclosure options produce the same public JSON; export time is intentionally excluded.

## Security boundary and known limitations

Only fields explicitly constructed by the converter enter the output. System prompts, chain-of-thought/thinking, local base URLs, arbitrary extra properties, raw logs, and free-text error messages are omitted. Selected text is checked for known credential/private-key patterns and email/local-user-path indicators. High-confidence credential matches block preview/export; PII-like warnings require acknowledgement.

Detection is not a security boundary and can have both false negatives and false positives. It cannot determine whether a repository or task is private, or whether a person's name is sensitive. Review the full preview and source manually; never place secrets in an exported record. Malformed data or unsupported schemas fail closed. Do not compare scores across different task sets or evaluation protocol versions as if they shared one scale.

## Future publication

A future read-only website can consume `benchmark-public/v1` directly without depending on the local app's `BenchmarkDocument` schema or Ollama code. This stage implements no website, upload API, database, scheduled run, or automatic publication. Any schema-breaking change requires a new format version and migration/reader plan; v1 output remains a stable historical artifact.
