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

const indexPath = path.join(normalizedScriptDir, "index.ts")
const chunkingModulePaths = [
  "lib/chunking/types.ts",
  "lib/chunking/text-normalization.ts",
  "lib/chunking/intent.ts",
  "lib/chunking/format-retrieval-chunk.ts",
  "lib/chunking/split-long-chunk.ts",
  "lib/chunking/article-units.ts",
  "lib/chunking/index.ts",
].map((fileName) => path.join(normalizedScriptDir, fileName))
const outputDir = path.join(normalizedScriptDir, ".chunking-snapshots")
const snapshotLabel = readSnapshotLabel(process.argv[2] ?? "baseline")

const fixtures = [
  {
    id: "payment-card-declined",
    title: "Карта не принимается",
    chunkSize: 700,
    overlap: 120,
    content: `
# Карта не принимается

## Когда использовать

- Клиент пишет: "карта не проходит"
- Клиент пишет: "не могу оплатить картой"
- Клиент пишет: "платеж отклонен"

## Что нужно сделать

1. Проверьте, что клиент вводит актуальные реквизиты карты.
2. Уточните, поддерживает ли банк клиента онлайн-платежи.
3. Если банк отклоняет платеж, попросите клиента попробовать другую карту или способ оплаты.

## Готовый ответ клиенту

Похоже, банк отклоняет оплату. Проверьте данные карты и попробуйте повторить платеж. Если ошибка сохранится, используйте другую карту или напишите нам номер заказа.
`,
  },
  {
    id: "money-charged-no-order",
    title: "Деньги списались, заказ не появился",
    chunkSize: 700,
    overlap: 120,
    content: `
## Фразы клиента

"деньги списались, а заказа нет"
"оплата прошла, но заказ не создан"
"платеж завис"

## Что нужно сделать

1. Попросите клиента прислать номер телефона или email из заказа.
2. Проверьте платеж в админке.
3. Если заказ не найден, передайте обращение оператору.

## Важно

Не просите клиента присылать полный номер карты, CVV или код из SMS. Эти данные нельзя обрабатывать в поддержке.

## Эскалация

Передайте обращение менеджеру, если деньги списались больше 15 минут назад и заказ не появился.
`,
  },
  {
    id: "long-return-policy",
    title: "Возврат средств",
    chunkSize: 420,
    overlap: 80,
    content: `
# Возврат средств

## Когда использовать

Клиент просит вернуть деньги за заказ. Клиент сообщает, что услуга не была оказана. Клиент хочет отменить заказ после оплаты.

## Что нужно сделать

1. Уточните номер заказа и причину возврата. Проверьте статус заказа и наличие выполненной услуги. Если заказ уже выполнен, объясните клиенту правила возврата и предложите передать обращение менеджеру.

2. Если заказ не выполнен, создайте обращение на возврат и предупредите клиента, что срок обработки зависит от банка. Обычно возврат занимает несколько рабочих дней, но точный срок зависит от платежной системы и банка клиента.

3. Если клиент сообщает о двойном списании, попросите прислать дату платежа, сумму и последние четыре цифры карты. Полный номер карты, CVV и коды подтверждения запрашивать нельзя.
`,
  },
]

const chunkingSource = readChunkingSource()
const buildRetrievalChunks = loadBuildRetrievalChunks(chunkingSource)

const createdAt = new Date().toISOString()
const snapshots = fixtures.map((fixture) => {
  const chunks = buildRetrievalChunks(
    fixture.title,
    fixture.content,
    fixture.chunkSize,
    fixture.overlap,
  )

  return {
    id: fixture.id,
    title: fixture.title,
    chunkSize: fixture.chunkSize,
    overlap: fixture.overlap,
    chunkCount: chunks.length,
    chunks,
  }
})

const report = {
  label: snapshotLabel,
  createdAt,
  source: path.relative(process.cwd(), indexPath).replace(/\\/g, "/"),
  fixtures: snapshots,
}

fs.mkdirSync(outputDir, { recursive: true })

const safeTimestamp = createdAt.replace(/[:.]/g, "-")
const outputPath = path.join(outputDir, `${snapshotLabel}-${safeTimestamp}.json`)

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")

console.log(`Chunking snapshot written: ${path.relative(process.cwd(), outputPath).replace(/\\/g, "/")}`)
console.log(`Fixtures: ${snapshots.length}`)
console.log(`Chunks: ${snapshots.map((snapshot) => `${snapshot.id}=${snapshot.chunkCount}`).join(", ")}`)

function readSnapshotLabel(value) {
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(value)) {
    throw new Error("Snapshot label must contain only letters, numbers, dashes or underscores")
  }

  return value
}

function extractChunkingSource(value) {
  const start = value.indexOf("function buildRetrievalChunks")
  const end = value.indexOf("async function fetchEmbeddings")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Cannot find chunking source block in kb-ingestion/index.ts")
  }

  return value.slice(start, end)
}

function readChunkingSource() {
  const source = fs.readFileSync(indexPath, "utf8")

  if (source.includes("function buildRetrievalChunks") && source.includes("async function fetchEmbeddings")) {
    return extractChunkingSource(source)
  }

  return chunkingModulePaths
    .filter((modulePath) => fs.existsSync(modulePath))
    .map((modulePath) => stripModuleSyntax(fs.readFileSync(modulePath, "utf8")))
    .join("\n\n")
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
    .replace(/\bexport\s+(?=function|const|class|type)/g, "")
}

function loadBuildRetrievalChunks(value) {
  const js = ts.transpileModule(`${value}\nglobalThis.__buildRetrievalChunks = buildRetrievalChunks\n`, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const context = {}
  vm.createContext(context)
  vm.runInContext(js, context, { filename: "kb-ingestion-chunking.js" })

  if (typeof context.__buildRetrievalChunks !== "function") {
    throw new Error("buildRetrievalChunks was not loaded from chunking source")
  }

  return context.__buildRetrievalChunks
}
