import assert from "node:assert/strict";
import test from "node:test";
import { generateResponse } from "../src/lib/ollama-client.ts";
import type { BenchmarkRunRequest } from "../src/types/benchmark.ts";

const request: BenchmarkRunRequest = {
  modelId: "qwen3.5:latest",
  prompt: "question",
  systemPrompt: "",
  temperature: 0,
  seed: 42,
  maxTokens: 512,
  contextLength: 4096,
  executionCount: 1,
  runMode: "warm",
  stream: false,
  think: true,
  runNumber: 1,
};

test("thinkを送り、thinkingと最終回答を別々に取得する", async (t) => {
  const originalFetch = globalThis.fetch;
  let sentThink: unknown;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_input, init) => {
    const sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    sentThink = sentBody.think;
    return Response.json({
      thinking: "reasoning",
      response: "final answer",
      done: true,
      done_reason: "stop",
      eval_count: 12,
      eval_duration: 1_000_000_000,
    });
  };

  const result = await generateResponse(request, new AbortController().signal);
  assert.equal(sentThink, true);
  assert.equal(result.thinking, "reasoning");
  assert.equal(result.response, "final answer");
  assert.equal(result.evalCount, 12);
});

test("ストリーミング時もthinkingとresponseを独立して連結する", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response(
      [
        JSON.stringify({ thinking: "step 1 " }),
        JSON.stringify({ thinking: "step 2" }),
        JSON.stringify({ response: "final " }),
        JSON.stringify({
          response: "answer",
          done: true,
          done_reason: "stop",
          eval_count: 9,
        }),
        "",
      ].join("\n"),
      { headers: { "Content-Type": "application/x-ndjson" } },
    );

  const result = await generateResponse(
    { ...request, stream: true },
    new AbortController().signal,
  );
  assert.equal(result.thinking, "step 1 step 2");
  assert.equal(result.response, "final answer");
  assert.equal(result.evalCount, 9);
});

test("chat形式のmessage.thinkingとmessage.contentも取得する", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    Response.json({
      message: {
        thinking: "chat reasoning",
        content: "chat answer",
      },
      done: true,
    });

  const result = await generateResponse(request, new AbortController().signal);
  assert.equal(result.thinking, "chat reasoning");
  assert.equal(result.response, "chat answer");
});

test("thinking未対応モデルはthink falseで再試行する", async (t) => {
  const originalFetch = globalThis.fetch;
  const thinkValues: unknown[] = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { think?: unknown };
    thinkValues.push(body.think);
    if (thinkValues.length === 1) {
      return Response.json(
        { error: "model does not support thinking" },
        { status: 400 },
      );
    }
    return Response.json({
      response: "fallback answer",
      done: true,
    });
  };

  const result = await generateResponse(request, new AbortController().signal);
  assert.deepEqual(thinkValues, [true, false]);
  assert.equal(result.response, "fallback answer");
  assert.equal(result.thinking, "");
});
