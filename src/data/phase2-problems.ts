import type { Phase2ProblemSet } from "../types/benchmark";

export const PHASE2_PROBLEM_SET: Phase2ProblemSet = {
  id: "local-ai-benchmark-phase2",
  title: "Local AI Benchmark Phase 2 問題セット",
  version: "2.0.0",
  problems: [
    {
      id: "p2-01-reasoning-verification",
      title: "推論過程の検証",
      version: "2.0.0",
      prompt:
        "ある会議にはA、B、C、Dの4人が参加します。発表順について「AはBより前」「CはDより後」「BはDより前」という条件があります。条件をすべて満たす発表順を1つ示し、その順序が各条件を満たすことを、第三者が検証できる短い説明で確認してください。内部の逐語的な思考ログではなく、結論の根拠となる確認手順だけを示してください。",
      evaluationCriteria: [
        {
          id: "correct-order",
          label: "正答性",
          dimension: "correctness",
          description: "提示した順序が3条件をすべて満たしている。",
          maxScore: 4,
          scoringMethod: "manual",
        },
        {
          id: "verifiable-reasoning",
          label: "推論過程の確認可能性",
          dimension: "reasoning_verifiability",
          description: "各条件と提示順序の対応を第三者が確認できる。",
          maxScore: 3,
          scoringMethod: "manual",
        },
        {
          id: "no-unnecessary-log",
          label: "簡潔さ",
          dimension: "conciseness",
          description: "不要な逐語的思考ログを出さず、検証に必要な根拠だけを示す。",
          maxScore: 3,
          scoringMethod: "manual",
        },
      ],
      expectedAnswerConditions: [
        "A < B < D < Cを満たす順序（例: A、B、D、C）を示す。",
        "AがBより前、CがDより後、BがDより前であることを個別に確認する。",
        "長い内部思考ログではなく検証可能な要点を記載する。",
      ],
    },
    {
      id: "p2-02-length-limited-summary",
      title: "文字数制限付き要約",
      version: "2.0.0",
      prompt:
        "次の文章を日本語100文字以内で要約してください。句読点も文字数に含めます。要約以外の前置きや文字数報告は書かないでください。\n\nローカルAIは、モデルを利用者のPCや組織内サーバーで動かす方式である。入力データを外部サービスへ送らずに処理できるため、機密性やオフライン利用の面で利点がある。一方、大規模モデルを快適に動かすには十分なメモリや計算資源が必要で、モデルの導入、更新、監視も利用者が担う。用途、必要な品質、保有する機材、運用コストを比較して採用を判断する必要がある。",
      evaluationCriteria: [
        {
          id: "within-100-characters",
          label: "100文字以内",
          dimension: "instruction_adherence",
          description: "回答全体が空でなく100文字以内である。",
          maxScore: 3,
          scoringMethod: "automatic",
          automaticRule: { type: "max_characters", maximum: 100 },
        },
        {
          id: "summary-correctness",
          label: "要約の正答性",
          dimension: "correctness",
          description: "利点、資源・運用負担、比較判断という主要点を正しく要約する。",
          maxScore: 5,
          scoringMethod: "manual",
        },
        {
          id: "summary-only",
          label: "出力形式",
          dimension: "instruction_adherence",
          description: "前置きや文字数報告を付けず要約のみを返す。",
          maxScore: 2,
          scoringMethod: "manual",
        },
      ],
      expectedAnswerConditions: [
        "回答全体が100文字以内。",
        "ローカルAIのプライバシー・オフライン面の利点を含む。",
        "計算資源と運用負担、および用途に応じた比較判断を含む。",
        "要約以外の文章を付けない。",
      ],
    },
    {
      id: "p2-03-strict-json",
      title: "JSON形式の厳密さ",
      version: "2.0.0",
      prompt:
        "次の情報を、厳密なJSONオブジェクト1個だけで出力してください。Markdownのコードフェンス、説明文、コメント、末尾カンマは禁止です。キーはこの順序で model、local、strengths とし、modelは文字列「Granite 4.1 8B」、localは真偽値true、strengthsは文字列「privacy」「offline」の2要素からなる配列にしてください。",
      evaluationCriteria: [
        {
          id: "strict-json-object",
          label: "JSON形式の厳密さ",
          dimension: "instruction_adherence",
          description: "JSONとして解析でき、指定キーだけを持つオブジェクトである。",
          maxScore: 5,
          scoringMethod: "automatic",
          automaticRule: {
            type: "strict_json",
            requiredKeys: ["model", "local", "strengths"],
            allowAdditionalKeys: false,
          },
        },
        {
          id: "json-values",
          label: "値の正答性",
          dimension: "correctness",
          description: "各値、型、配列要素、キー順が指定どおりである。",
          maxScore: 5,
          scoringMethod: "manual",
        },
      ],
      expectedAnswerConditions: [
        "JSONオブジェクト1個だけを出力する。",
        "キー順はmodel、local、strengths。",
        "modelは「Granite 4.1 8B」、localはtrue。",
        "strengthsは「privacy」「offline」の順の配列。",
      ],
    },
    {
      id: "p2-04-ambiguous-request",
      title: "曖昧な依頼への対応",
      version: "2.0.0",
      prompt:
        "「来週の会議をいい感じに設定して」とだけ依頼されました。あなたには参加者、所要時間、タイムゾーン、候補時間、会議の目的に関する情報がありません。実際の予定を作成したふりをせず、依頼者へ返す最初の回答を書いてください。",
      evaluationCriteria: [
        {
          id: "identify-missing-context",
          label: "曖昧さの認識",
          dimension: "ambiguity_handling",
          description: "不足情報を認識し、重要な確認事項を優先して尋ねる。",
          maxScore: 5,
          scoringMethod: "manual",
        },
        {
          id: "no-false-action",
          label: "未実行操作の扱い",
          dimension: "instruction_adherence",
          description: "会議を作成済みであるかのように述べない。",
          maxScore: 3,
          scoringMethod: "manual",
        },
        {
          id: "concise-clarification",
          label: "簡潔さ",
          dimension: "conciseness",
          description: "過剰な質問を羅列せず、次に必要な確認を簡潔に示す。",
          maxScore: 2,
          scoringMethod: "manual",
        },
      ],
      expectedAnswerConditions: [
        "参加者、所要時間、タイムゾーン、候補時間または目的を確認する。",
        "予定を作成したとは主張しない。",
        "依頼者が回答しやすい簡潔な確認にする。",
      ],
    },
    {
      id: "p2-05-self-correction",
      title: "自己訂正・検算",
      version: "2.0.0",
      prompt:
        "17×24を計算してください。最初の計算結果を示した後、別の方法で検算し、両者が一致するかを明記してください。もし途中で誤りに気づいた場合は、誤りを隠さず訂正してください。回答は6行以内にしてください。",
      evaluationCriteria: [
        {
          id: "correct-product",
          label: "正答性",
          dimension: "correctness",
          description: "積が408である。",
          maxScore: 4,
          scoringMethod: "manual",
        },
        {
          id: "independent-check",
          label: "自己訂正・検算",
          dimension: "self_correction",
          description: "最初の計算とは区別できる方法で検算し、一致を確認する。",
          maxScore: 4,
          scoringMethod: "manual",
        },
        {
          id: "within-six-lines",
          label: "簡潔さ",
          dimension: "conciseness",
          description: "6行以内で不要な思考ログを含めない。",
          maxScore: 2,
          scoringMethod: "manual",
        },
      ],
      expectedAnswerConditions: [
        "17×24=408と示す。",
        "分配法や逆算など別の方法で検算する。",
        "2つの結果が一致すると明記する。",
        "6行以内。",
      ],
    },
    {
      id: "p2-06-multiple-instructions",
      title: "複数指示の遵守",
      version: "2.0.0",
      prompt:
        "次の条件をすべて守って回答してください。\n1. 日本語で書く。\n2. 箇条書きをちょうど3項目にする。\n3. 各項目は「- 」で始める。\n4. ローカルAIを評価するときの注意点を扱う。\n5. 各項目に「比較」という語を1回以上含める。\n6. 見出し、前置き、まとめは付けない。",
      evaluationCriteria: [
        {
          id: "required-comparison-word",
          label: "必須語",
          dimension: "instruction_adherence",
          description: "「比較」を含む。",
          maxScore: 2,
          scoringMethod: "automatic",
          automaticRule: { type: "required_phrases", phrases: ["比較"] },
        },
        {
          id: "all-format-rules",
          label: "複数指示の遵守",
          dimension: "instruction_adherence",
          description: "3項目、行頭、各項目の必須語、余分な文章なしをすべて満たす。",
          maxScore: 5,
          scoringMethod: "manual",
        },
        {
          id: "useful-content",
          label: "内容の正答性",
          dimension: "correctness",
          description: "評価上有用で重複しない注意点を3つ示す。",
          maxScore: 3,
          scoringMethod: "manual",
        },
      ],
      expectedAnswerConditions: [
        "「- 」で始まる日本語の箇条書きがちょうど3項目。",
        "各項目に「比較」を含む。",
        "見出し、前置き、まとめを付けない。",
        "ローカルAIの評価に関する異なる注意点を示す。",
      ],
    },
    {
      id: "p2-07-javascript-cause",
      title: "JavaScriptの原因説明",
      version: "2.0.0",
      prompt:
        "次のJavaScriptが期待どおりに0、1、2を1秒後に表示せず、1、2、3を表示する原因を説明し、最小限の修正版を1つ示してください。原因説明と修正版を分け、不要な一般論は書かないでください。\n\n```javascript\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 1000);\n}\n```",
      evaluationCriteria: [
        {
          id: "cause-correctness",
          label: "原因説明の正答性",
          dimension: "correctness",
          description: "varの関数スコープ、同一変数の参照、実行時点の値を正しく説明する。",
          maxScore: 5,
          scoringMethod: "manual",
        },
        {
          id: "minimal-fix",
          label: "修正の正答性",
          dimension: "correctness",
          description: "letへの変更など、0、1、2を得る最小限の有効な修正を示す。",
          maxScore: 3,
          scoringMethod: "manual",
        },
        {
          id: "focused-answer",
          label: "簡潔さ",
          dimension: "conciseness",
          description: "原因と修正版を分け、不要な一般論を含めない。",
          maxScore: 2,
          scoringMethod: "manual",
        },
      ],
      expectedAnswerConditions: [
        "varで宣言したiを全コールバックが共有することを説明する。",
        "タイマー実行時にはループ終了後のiが3であることを説明する。",
        "varをletへ変えるなどの最小修正を示す。",
      ],
    },
    {
      id: "p2-08-8b-vs-80b",
      title: "8Bと80Bの実用比較",
      version: "2.0.0",
      prompt:
        "同じモデル系列の8Bモデルと80Bモデルを、ローカル環境で日常的に使う観点から比較してください。単純に80Bが常に優れるとは決めつけず、回答品質、速度、メモリ・VRAM、消費電力、導入・運用のしやすさ、用途適合を扱ってください。最後に「どちらを選ぶべきか」は条件付きで結論を示してください。600文字以内で、表は使わないでください。",
      evaluationCriteria: [
        {
          id: "within-600-characters",
          label: "600文字以内",
          dimension: "instruction_adherence",
          description: "回答全体が空でなく600文字以内である。",
          maxScore: 2,
          scoringMethod: "automatic",
          automaticRule: { type: "max_characters", maximum: 600 },
        },
        {
          id: "balanced-comparison",
          label: "実用比較の正答性",
          dimension: "correctness",
          description: "指定された6観点をバランスよく比較し、モデル差を断定しすぎない。",
          maxScore: 5,
          scoringMethod: "manual",
        },
        {
          id: "conditional-recommendation",
          label: "条件付き結論",
          dimension: "ambiguity_handling",
          description: "用途とハードウェア条件に応じて選択が変わる結論を示す。",
          maxScore: 3,
          scoringMethod: "manual",
        },
      ],
      expectedAnswerConditions: [
        "品質、速度、メモリ・VRAM、消費電力、運用、用途を比較する。",
        "80Bが常に最善とは断定しない。",
        "ハードウェアと用途に基づく条件付き結論を示す。",
        "600文字以内で表を使わない。",
      ],
    },
  ],
};

export function getPhase2Problem(problemId: string) {
  return PHASE2_PROBLEM_SET.problems.find((problem) => problem.id === problemId);
}
