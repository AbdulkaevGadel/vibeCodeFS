#!/usr/bin/env node

import { readFileSync } from "node:fs"

const embeddingDimension = 384
const defaultModel = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
const defaultQuery = "карта не принимается"

loadDotenv(".env.local")
loadDotenv(".env")

const query = process.argv.slice(2).join(" ").trim() || defaultQuery
const model = process.env.HF_EMBEDDING_MODEL?.trim() || defaultModel
const hfToken = process.env.HF_API_TOKEN?.trim()
const endpoint = process.env.HF_FEATURE_EXTRACTION_URL?.trim() || getHfEndpoint(model)

if (!hfToken) {
  fail("HF_API_TOKEN is not configured. Set it in the shell env or .env.local.")
}

const embedding = await fetchEmbedding(endpoint, hfToken, query)

if (!isEmbedding(embedding, embeddingDimension)) {
  fail(`Expected embedding dimension ${embeddingDimension}, got ${Array.isArray(embedding) ? embedding.length : "invalid shape"}.`)
}

const vectorLiteral = `[${embedding.join(",")}]`

console.log(`-- Query: ${query}`)
console.log(`-- Model: ${model}`)
console.log(`-- Dimension: ${embeddingDimension}`)
console.log("")
console.log("-- Full query embedding:")
console.log(vectorLiteral)
console.log("")
console.log("-- Supabase SQL Editor: top-10 active completed candidates without threshold.")
console.log("-- This is read-only diagnostics.")
console.log(`
with query_embedding as (
  select '${vectorLiteral}'::vector as embedding
)
select
  a.id as article_id,
  a.title as article_title,
  kcs.id as chunk_set_id,
  kcs.ingestion_pipeline_version,
  kc.id as chunk_id,
  kc.chunk_index,
  1 - (kc.embedding <=> q.embedding) as similarity_score,
  kc.embedding <=> q.embedding as cosine_distance,
  length(kc.chunk_text) as chunk_text_length,
  kc.chunk_text
from query_embedding q
join public.knowledge_chunks kc
  on true
join public.knowledge_chunk_sets kcs
  on kcs.id = kc.chunk_set_id
join public.knowledge_base_articles a
  on a.id = kc.article_id
where kcs.is_active = true
  and kcs.status = 'completed'
  and kc.embedding_status = 'completed'
  and kc.embedding is not null
  and a.status = 'published'::public.article_status
order by kc.embedding <=> q.embedding
limit 10;
`.trim())

async function fetchEmbedding(url, token, input) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      inputs: [input],
      options: {
        wait_for_model: true,
      },
    }),
  })

  const responseText = await response.text()

  if (!response.ok) {
    fail(`Hugging Face request failed with status ${response.status}: ${safeProviderMessage(responseText)}`)
  }

  return normalizeEmbeddingResponse(JSON.parse(responseText))
}

function normalizeEmbeddingResponse(value) {
  if (!Array.isArray(value)) {
    fail("Hugging Face response is not an array.")
  }

  if (isEmbedding(value, embeddingDimension)) {
    return value
  }

  if (value.length === 1 && isEmbedding(value[0], embeddingDimension)) {
    return value[0]
  }

  fail("Hugging Face response has invalid embedding shape.")
}

function isEmbedding(value, dimension) {
  return Array.isArray(value)
    && value.length === dimension
    && value.every((item) => typeof item === "number" && Number.isFinite(item))
}

function getHfEndpoint(currentModel) {
  return `https://router.huggingface.co/hf-inference/models/${encodeURIComponentModel(currentModel)}/pipeline/feature-extraction`
}

function encodeURIComponentModel(currentModel) {
  return currentModel.split("/").map((part) => encodeURIComponent(part)).join("/")
}

function loadDotenv(path) {
  let content = ""

  try {
    content = readFileSync(path, "utf8")
  } catch {
    return
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith("#")) {
      continue
    }

    const separatorIndex = trimmed.indexOf("=")

    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "")

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function safeProviderMessage(value) {
  return value.replace(/hf_[A-Za-z0-9_-]+/g, "hf_***").slice(0, 500)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
