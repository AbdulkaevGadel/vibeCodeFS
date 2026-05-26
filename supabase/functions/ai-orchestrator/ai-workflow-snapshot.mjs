import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const ts = require("../../../support-admin/node_modules/typescript/lib/typescript.js")

const scriptDir = path.dirname(new URL(import.meta.url).pathname)
const normalizedScriptDir = process.platform === "win32" && scriptDir.startsWith("/")
  ? scriptDir.slice(1)
  : scriptDir

const libDir = path.join(normalizedScriptDir, "lib")
const workflowPath = path.join(libDir, "workflow.ts")
const outputDir = path.join(normalizedScriptDir, ".ai-workflow-snapshots")
const snapshotLabel = readSnapshotLabel(process.argv[2] ?? "baseline")

const source = readAiWorkflowSource()
const helpers = loadAiWorkflowHelpers(source)
const createdAt = new Date().toISOString()

const triggerMessage = {
  id: "msg-current",
  chat_id: "chat-1",
  text: "Здравствуйте, карта не принимается при оплате заказа",
  sender_type: "client",
  created_at: "2026-05-26T09:00:00.000Z",
}
const historyMessages = [
  {
    id: "msg-history-client",
    chat_id: "chat-1",
    text: "Я пытаюсь оплатить заказ",
    sender_type: "client",
    created_at: "2026-05-26T08:58:00.000Z",
  },
  {
    id: "msg-history-ai",
    chat_id: "chat-1",
    text: "На связи ИИ-помощник службы поддержки.\nУточните, пожалуйста, способ оплаты.",
    sender_type: "ai",
    created_at: "2026-05-26T08:59:00.000Z",
  },
]
const kbFragments = [
  {
    chunk_id: "chunk-1",
    article_id: "article-1",
    chunk_set_id: "set-1",
    chunk_index: 0,
    similarity_score: 0.82,
    article_title: "Карта не принимается",
    article_slug: "card-declined",
    content_checksum: "checksum-1",
    ingestion_pipeline_version: "v1",
    text: "Проверьте актуальность реквизитов карты. Если банк отклоняет платеж, попросите клиента попробовать другую карту или способ оплаты.",
    truncated: false,
  },
]
const retrievalResult = {
  retrieval_status: "hit",
  top_similarity_score: 0.82,
  matched_chunks_count: 1,
  chunks: [
    {
      chunk_id: "chunk-1",
      article_id: "article-1",
      chunk_index: 0,
      similarity_score: 0.82,
    },
  ],
}

const contextSnapshot = helpers.buildContextSnapshot(
  triggerMessage,
  historyMessages,
  kbFragments,
  retrievalResult,
)
const promptSnapshot = helpers.buildPromptSnapshot(contextSnapshot)

const report = {
  label: snapshotLabel,
  createdAt,
  source: source.files.map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, "/")),
  fixtures: {
    intent: [
      "Здравствуйте",
      "Спасибо, помогло",
      "До свидания",
      "Позовите оператора",
      "Карта не принимается",
    ].map((text) => ({
      text,
      result: helpers.classifyIntent(text),
    })),
    retrievalQueryText: [
      "Здравствуйте, карта не принимается",
      "Добрый день! как вернуть деньги?",
      "Привет",
      "Карта не принимается",
    ].map((text) => ({
      text,
      result: helpers.getRetrievalQueryText(text),
    })),
    contextSnapshot,
    promptSnapshot,
    llmJsonParsing: [
      '{"kind":"answer","answer_text":"Проверьте данные карты."}',
      '{"kind":"insufficient","answer_text":""}',
      'Ответ ниже:\n{"kind":"answer","answer_text":"Попробуйте другую карту."}',
      "not json",
    ].map((content) => readLlmParseResult(helpers.parseLlmJson, content)),
  },
}

fs.mkdirSync(outputDir, { recursive: true })

const safeTimestamp = createdAt.replace(/[:.]/g, "-")
const outputPath = path.join(outputDir, `${snapshotLabel}-${safeTimestamp}.json`)

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")

console.log(`AI workflow snapshot written: ${path.relative(process.cwd(), outputPath).replace(/\\/g, "/")}`)
console.log(`Intent fixtures: ${report.fixtures.intent.length}`)
console.log(`LLM parser fixtures: ${report.fixtures.llmJsonParsing.length}`)

function readSnapshotLabel(value) {
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(value)) {
    throw new Error("Snapshot label must contain only letters, numbers, dashes or underscores")
  }

  return value
}

function readAiWorkflowSource() {
  const modulePaths = [
    "utils.ts",
    "intent/message-text.ts",
    "intent/intent.ts",
    "context/context-sources.ts",
    "context/context-snapshot.ts",
    "context/context.ts",
    "context/prompt.ts",
    "retrieval/embedding-contract.ts",
    "retrieval/embedding-provider.ts",
    "retrieval/retrieval-rpc.ts",
    "retrieval/retrieval-save-result.ts",
    "retrieval/retrieval.ts",
    "response/llm-contract.ts",
    "response/llm-provider.ts",
    "response/llm.ts",
  ]
    .map((fileName) => path.join(libDir, fileName))
    .filter((filePath) => fs.existsSync(filePath))

  if (modulePaths.length > 0) {
    return {
      files: modulePaths,
      text: modulePaths.map((filePath) => stripModuleSyntax(fs.readFileSync(filePath, "utf8"))).join("\n\n"),
    }
  }

  return {
    files: [workflowPath],
    text: stripModuleSyntax(fs.readFileSync(workflowPath, "utf8")),
  }
}

function stripModuleSyntax(value) {
  const lines = value.split(/\r?\n/)
  const output = []
  let skippingImport = false

  for (const line of lines) {
    if (!skippingImport && line.startsWith("import ")) {
      skippingImport = !line.includes(" from ")
      continue
    }

    if (skippingImport) {
      if (line.includes(" from ")) {
        skippingImport = false
      }

      continue
    }

    output.push(line)
  }

  return output
    .join("\n")
    .replace(/\bexport\s+(?=async function|function|const|class|type)/g, "")
    .replace(/\bexport\s+type\s+\{[^}]*\}\s*/g, "")
    .replace(/\bexport\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?\s*/g, "")
}

function loadAiWorkflowHelpers(source) {
  const js = ts.transpileModule(`${prelude()}\n${source.text}\n${helperExports()}`, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const context = {
    console,
    setTimeout,
    clearTimeout,
    Deno: {
      env: {
        get() {
          return undefined
        },
      },
    },
  }
  vm.createContext(context)
  vm.runInContext(js, context, { filename: "ai-orchestrator-workflow-snapshot.js" })

  for (const name of [
    "classifyIntent",
    "getRetrievalQueryText",
    "buildContextSnapshot",
    "buildPromptSnapshot",
    "parseLlmJson",
  ]) {
    if (typeof context.__aiWorkflowHelpers?.[name] !== "function") {
      throw new Error(`${name} was not loaded from AI workflow source`)
    }
  }

  return context.__aiWorkflowHelpers
}

function prelude() {
  return `
const config = {
  promptVersion: "phase-9-context-prompt-v1",
  retrieval: {
    matchThreshold: 0.60,
    matchCount: 5,
    candidateCount: 50,
    stageTimeoutMs: 45000,
    embeddingModel: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    embeddingDimension: 384,
    embeddingMaxProviderRetries: 1,
  },
  context: {
    enabled: true,
    builderVersion: "context-builder-v1",
    maxHistoryMessages: 8,
    maxClientHistoryMessages: 4,
    maxAiHistoryMessages: 4,
    maxHistoryAgeHours: 24,
    maxHistoryMessageChars: 800,
    maxKbFragments: 5,
    maxKbFragmentChars: 1200,
    maxPromptChars: 9000,
    maxCurrentMessageChars: 2000,
  },
  llm: {
    maxProviderRetries: 1,
    requestTimeoutMs: 20000,
    endpoint: "https://router.huggingface.co/v1/chat/completions",
    model: "Qwen/Qwen2.5-7B-Instruct-1M:cheapest",
    temperature: 0.2,
    maxOutputTokens: 500,
  },
}
class OrchestratorError extends Error {
  constructor(message, errorType) {
    super(message)
    this.name = "OrchestratorError"
    this.errorType = errorType
  }
}
function safeProviderMessage(value) {
  return value.replace(/hf_[A-Za-z0-9_-]+/g, "hf_***").slice(0, 500)
}
`
}

function helperExports() {
  return `
globalThis.__aiWorkflowHelpers = {
  classifyIntent,
  getRetrievalQueryText,
  buildContextSnapshot,
  buildPromptSnapshot,
  parseLlmJson,
}
`
}

function readLlmParseResult(parseLlmJson, content) {
  try {
    return {
      content,
      ok: true,
      result: parseLlmJson(content),
    }
  } catch (error) {
    return {
      content,
      ok: false,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}
