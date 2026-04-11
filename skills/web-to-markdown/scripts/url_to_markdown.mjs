#!/usr/bin/env node

import { URL } from "node:url";

function parseArgs(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const url = args.find((v) => !v.startsWith("--")) || "";
  return { url, json };
}

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function htmlToMarkdown(html) {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, contentType: res.headers.get("content-type") || "" };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { url: rawUrl, json } = parseArgs(process.argv);
  const normalizedUrl = normalizeUrl(rawUrl);
  if (!normalizedUrl) {
    const err = "Invalid URL. Please provide a valid http(s) URL.";
    if (json) {
      console.log(JSON.stringify({ ok: false, error: err }, null, 2));
      return;
    }
    console.error(err);
    process.exitCode = 1;
    return;
  }

  const result = {
    ok: false,
    strategy: "jina-first",
    source: "",
    normalizedUrl,
    markdown: "",
    error: "",
  };

  const jinaUrl = `https://r.jina.ai/${normalizedUrl}`;
  try {
    const jina = await fetchText(jinaUrl);
    if (jina.ok && jina.body.trim()) {
      result.ok = true;
      result.source = "r.jina.ai";
      result.markdown = jina.body.trim();
    }
  } catch {
    // Try direct fetch fallback below.
  }

  if (!result.ok) {
    result.strategy = "direct-html-fallback";
    try {
      const direct = await fetchText(normalizedUrl);
      if (!direct.ok) {
        result.error = `Direct fetch failed with status ${direct.status}`;
      } else {
        const markdown = htmlToMarkdown(direct.body || "");
        if (!markdown) {
          result.error = "Fetched HTML but extracted Markdown is empty";
        } else {
          result.ok = true;
          result.source = "direct-html";
          result.markdown = markdown;
        }
      }
    } catch (e) {
      result.error = `Direct fetch exception: ${e?.message || String(e)}`;
    }
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.ok) {
    console.error(result.error || "Failed to fetch and convert URL");
    process.exitCode = 1;
    return;
  }

  console.log(result.markdown);
}

await main();
