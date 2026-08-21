# Arabic Search and Typo-Tolerant Fallback

## Goals

Arabic support should be a first-class tested feature, while remaining portable across FTS5 environments that do not allow custom tokenizers.

## Arabic normalization philosophy

Normalization must be:

- deterministic;
- conservative by default;
- non-mutating with respect to application source data;
- configured **at logical-index level in v1** so the same profile applies to indexed searchable text and the query;
- identical in JavaScript and generated SQL for every transform allowed in linked mode.

Linked mode does **not** assume a general Unicode normalization primitive exists in SQLite SQL. Any transform that requires NFC/NFKC, ICU, native extensions, or application callbacks is manual-mode-only until a portable implementation is proven.

## `arabic-basic` profile

`arabic-basic` is an explicitly enumerated finite transform set that can be represented with portable string replacements/removals.

Recommended v1 transforms:

1. remove tatweel `ـ`;
2. remove an explicit curated set of common Arabic vocalization combining marks/harakat;
3. normalize selected precomposed alef variants:
   - `أ`, `إ`, `آ`, `ٱ` -> `ا`;
4. normalize alif maqsura:
   - `ى` -> `ي`.

Do **not** make these default replacements:

- `ة -> ه`;
- `ؤ -> و`;
- `ئ -> ي`.

Do **not** claim that presentation forms, compatibility characters, or arbitrary canonically-equivalent Unicode sequences are normalized in linked mode. Generic NFC/NFKC normalization is outside the v1 portable SQL contract.

An optional future aggressive profile may be added only after relevance/corpus benchmarks.

## Declarative transform table

Keep the portable profile data-driven and finite:

```ts
const arabicBasic = definePortableNormalizer({
  id: "arabic-basic",
  replacements: [
    ["ـ", ""],
    ["أ", "ا"],
    ["إ", "ا"],
    ["آ", "ا"],
    ["ٱ", "ا"],
    ["ى", "ي"],
    // explicit curated harakat code points -> ""
  ],
});
```

The SQL compiler may emit bounded nested `replace()` expressions or another equivalently portable implementation proven on all required runtimes. Generated SQL size and trigger overhead are benchmarked.

Do not prepend JavaScript `normalize("NFKC")` in linked mode unless an equivalent SQL transform exists and passes the same fixtures.

## JavaScript/SQL equivalence tests

Create a curated corpus containing:

- Modern Standard Arabic;
- Gulf/Egyptian common words;
- names;
- mixed Arabic/English SKUs;
- explicitly enumerated harakat forms;
- Quranic-style/less-common marks as **edge cases that document supported versus unsupported behavior**, without claiming Quran-specific correctness;
- punctuation and Arabic-Indic/Western digits;
- presentation-form/compatibility samples that prove v1 does not silently promise NFKC equivalence.

For every transform inside the linked-mode contract:

```text
JS normalize(input) === SQL normalize(input)
```

must pass on Bun SQLite, D1 local, and libSQL.

If a sample requires a transform outside the profile, the test should assert the documented non-normalized behavior rather than broadening the profile accidentally.

## Arabic digits

Do not automatically normalize Arabic-Indic digits (`٠١٢٣٤٥٦٧٨٩`) to Western digits in `arabic-basic` until product expectations are explicit.

Offer a separate optional `numeric-arabic` transform that maps digits when desired.

## Tokenization

FTS5 baseline uses `unicode61`; custom tokenizer loading is not part of the v1 portability contract.

The normalization layer runs before FTS tokenization. `unicode61` should not be confused with generic application-level NFC/NFKC normalization; the project guarantees only the explicitly defined normalizer behavior it tests.

## Stemming

No Arabic stemmer in v1.

Reasons:

- stemming quality is domain-sensitive;
- custom tokenizers are not portable across hosted runtimes;
- aggressive stemming can materially reduce relevance quality.

Potential future work:

- Arabic light stemmer in manual-index mode;
- token expansion at query time;
- backend-native analyzers if supported.

## Synonyms for Arabic/English cross-search

Use synonyms for transliterated/brand terms:

```ts
{
  iphone: ["ايفون", "آيفون"],
  course: ["كورس", "دورة"],
}
```

Synonyms are not a replacement for normalization. Normalize all synonym entries before expansion.

## Highlighting normalized Arabic

Backend-native highlighting can return the normalized indexed representation rather than the source spelling.

Preferred long-term architecture:

- retain original source text when formatting requires it;
- normalize in JavaScript while producing an alignment map;
- find normalized match ranges;
- map ranges back to original text;
- apply caller-selected markers as text, not trusted HTML.

This portable original-text highlighter may ship after basic FTS5 highlighting. v1 docs/examples must state exactly whether a result is highlighting normalized indexed text or original source text. Never imply unsupported Unicode normalization alignment.

## Typo tolerance: realistic v1 definition

Do not claim Meilisearch-equivalent typo tolerance.

### Exact-first pipeline

```text
query
  |
exact + prefix search
  |
results sufficient? ---- yes --> return
  |
 no
  v
bounded fuzzy candidate retrieval
  |
Damerau-Levenshtein rerank
  |
merge after exact results
```

### Suggested typo thresholds

Start with familiar conservative thresholds, benchmark before locking:

- query token length 1–4: 0 edits;
- 5–8: up to 1 edit;
- 9+: up to 2 edits.

Make thresholds configurable. Do not copy other engines' special-case behavior unless tests justify it.

## FTS5 trigram companion

When `typoTolerance.mode === "fallback"`, create/use a companion trigram FTS5 table only when the adapter/backend runtime probe confirms the tokenizer and application policy enables the feature.

Purpose:

- retrieve documents sharing character trigrams with misspelled query tokens;
- bound candidate retrieval before application-side edit-distance reranking.

It is not itself a full typo algorithm.

### Candidate controls

Mandatory:

- minimum token length;
- max fuzzy query terms;
- max SQL candidates, e.g. 200 default;
- max hydrated text bytes per candidate;
- time/cancellation budget where runtime supports it;
- no fuzzy fallback for empty/one-character queries;
- D1 fuzzy fallback disabled by default until cost benchmarks exist;
- effective capability resolution disables the path when trigram is unavailable even if the index requested it.

## Reranking

Use Damerau-Levenshtein distance at token level.

Ranking groups:

1. exact normal search results;
2. prefix results;
3. one-edit fuzzy matches;
4. two-edit fuzzy matches.

Within each group, preserve backend relevance where meaningful.

Do not merge fuzzy BM25 and exact BM25 into one arbitrary weighted scalar without benchmarks.

## Fuzzy result explainability

Optional diagnostics mode:

```ts
{
  matchedBy: "fuzzy",
  corrections: [
    { query: "iphoen", matched: "iphone", distance: 1 }
  ]
}
```

Diagnostics should be disabled by default in production responses to avoid overhead.

## Future better typo architecture

If real usage proves typo tolerance is core, evaluate a persistent term dictionary + deletion index/SymSpell-style structure or a compact FST implementation. That is a separate engineering project with index-maintenance consequences and must not block v1.

## Normative trigram candidate algorithm

The companion trigram index is a **candidate generator**, not an edit-distance engine. The implementation must follow this bounded pipeline.

### 1. Eligibility

A token is eligible only if:

- fuzzy fallback is enabled by policy and effective capabilities;
- the exact/prefix path did not satisfy the configured fallback threshold;
- the normalized token contains at least 3 Unicode code points;
- query/token/candidate limits remain within runtime budgets.

Length here means Unicode code points, not JavaScript UTF-16 code units. Implement using code-point iteration (for example `Array.from(value)`), with explicit tests for astral characters and combining marks.

### 2. Build code-point trigrams

For normalized code points `c[0..n-1]`, generate every contiguous 3-code-point gram:

```text
iphone -> iph, pho, hon, one
iphoen -> iph, pho, hoe, oen
```

Deduplicate grams per token. Enforce `maxTrigramsPerToken` and `maxFuzzyQueryTokens` before SQL compilation.

### 3. Candidate retrieval

Compile the grams as a bounded OR-style trigram retrieval expression supported by the FTS5 trigram companion. Do **not** query the misspelled full token and call that approximate matching.

Each candidate obtains a gram-overlap count/ratio. Require a configurable minimum overlap before application-side edit distance. The exact SQL strategy may vary by backend, but semantic conformance requires the same candidate-cap and overlap policy.

Suggested policy surface (architecture target). Shipped `FuzzyCandidatePolicy`
in `@siftlite/core` uses numeric fields only: `minGramOverlap` is a number
(default `1`), and there is no `maxCandidateTextBytes` field. Candidate
payload bounding is the candidate cap plus batched `IN` reads.

```ts
interface FuzzyCandidatePolicy {
  minTokenCodepoints: number;       // default 3; production default may be higher
  maxQueryTokens: number;
  maxTrigramsPerToken: number;
  minGramOverlap: number | ((gramCount: number) => number);
  maxCandidates: number;
  maxCandidateTextBytes: number;
  maxEditDistance: number;
}
```

### 4. Rerank

Fetch only the bounded data required for scoring. Apply Damerau-Levenshtein to eligible token/text forms, reject candidates over the configured distance, then merge them **after** exact/prefix results. Shipped `fallback` mode always-merges: exact/prefix hits keep their backend order; fuzzy-only survivors append by edit distance and never displace an exact match.

### 5. Short queries

FTS5 trigram full-text queries do not provide normal candidate matching for substrings shorter than three Unicode characters. SiftLite therefore does not enter fuzzy trigram fallback for short tokens and never falls back to an accidental broad/linear substring scan.

### 6. D1 policy

D1 remains fuzzy-disabled by default until measured 100k/1m corpora demonstrate acceptable query duration, rows read, statement size, and candidate payload. Enabling it is an application policy choice, not inferred solely from trigram availability.
