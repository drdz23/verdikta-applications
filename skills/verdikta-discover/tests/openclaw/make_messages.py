#!/usr/bin/env python3
"""Build one model-input message per case: prompt, owner_context, and the fixture request.

usage: make_messages.py CASES_JSON OUT_DIR
Fixtures are realistic requests built to the item count each prompt states (keyed by case
id, or by source_case for holdout paraphrases): fictional vendors documented on the reserved
.example TLD, which never resolves, so no fixture can cause real egress. Cases without a
builder (B03) receive the package's fixture-only example unchanged. Expected labels are
never written to messages.
"""
import json, os, sys

SKILL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
cases_path, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
cases = json.load(open(cases_path))['cases']
# Realistic requests: fictional vendors whose documentation lives on the reserved .example TLD
# (RFC 2606; it never resolves, so a fetch cannot leak anything), fixture_only false, one
# source per vendor or entity, so outsourcing is judged on a coherent task. B03 alone keeps
# the package's fixture-only example to test that fixture status doesn't decide fit.
AS_OF = "2026-09-30"
VENDORS = [
    ("Northwind Queue API v3.2", "https://docs.northwind-queue.example/v3.2/reference", [
        "limits a single message body to 256 KB", "retains unacknowledged messages for 14 days",
        "delivers messages at least once, not exactly once", "supports FIFO ordering only within a message group",
        "rate-limits publishers to 3,000 requests per second per queue", "encrypts messages at rest with AES-256 by default"]),
    ("Larkspur Storage API v1.8", "https://docs.larkspur-storage.example/1.8/api", [
        "caps a single-part upload at 5 GB", "offers read-after-write consistency for new objects",
        "requires multipart upload above 100 MB", "keeps deleted objects for 30 days when versioning is on",
        "signs requests with HMAC-SHA256", "returns HTTP 503 with Retry-After when throttling"]),
    ("Tessel Auth SDK 5.1", "https://dev.tessel-auth.example/sdk/5.1/guide", [
        "issues access tokens that expire after 60 minutes", "rotates refresh tokens on every use",
        "supports PKCE for public clients", "requires TLS 1.2 or later",
        "caches JWKS keys for 24 hours", "drops support for the implicit grant"]),
    ("Quarry Search API 2026-06", "https://api-docs.quarry-search.example/2026-06/overview", [
        "returns at most 1,000 results per query", "paginates with opaque cursors that expire after 10 minutes",
        "supports fuzzy matching up to edit distance 2", "indexes new documents within 5 seconds",
        "limits query strings to 2,048 characters", "exposes a free tier of 10,000 queries per month"]),
]

def claims_request(n, cid, mode="INDEPENDENT_PUBLIC_RETRIEVAL", vendors=None):
    vs = vendors or VENDORS
    per = -(-n // len(vs))  # spread claims evenly across the vendors
    picked = [f"{name} {fact}." for name, _, facts in vs for fact in facts[:per]][:n]
    return {"schema_version": "1.0.0", "task_id": f"claims-{cid.lower()}", "fixture_only": False,
            "data_classification": "PUBLIC_NON_SENSITIVE",
            "source_policy": {"mode": mode, "allowed_sources": [v[1] for v in vs if any(t.startswith(v[0]) for t in picked)],
                              "version_scope": "The versions named in each claim, as documented on the as_of date",
                              "as_of": AS_OF, "minimum_locations_per_item": 1, "max_search_actions_per_item": 3,
                              "access_failure_policy": "LOG_LIMITATION_DO_NOT_FABRICATE"},
            "claims": [{"claim_id": f"C{i + 1}", "text": t} for i, t in enumerate(picked)]}

TOOLS = ["Brindle CLI", "Cairn Build", "Driftwood Lint", "Ember Test", "Fathom Profiler", "Gantry Deploy",
         "Harrow Format", "Inkwell Docs", "Juniper Bundle", "Kestrel Watch"]
FIELDS = {
    "latest_stable_release_date": ("ISO 8601 date of the most recent stable (non-prerelease) release", "string"),
    "latest_stable_version": ("Version string of the most recent stable release", "string"),
    "license_spdx": ("SPDX identifier of the project license", "string"),
    "minimum_runtime": ("Minimum supported language runtime version, as documented", "string"),
    "primary_language": ("Main implementation language named by the project", "string"),
    "max_request_size_bytes": ("Maximum documented request body size, in bytes", "number"),
    "supports_http2": ("Whether the SDK documents HTTP/2 support", "boolean"),
    "minimum_tls_version": ("Minimum TLS version the SDK negotiates", "string"),
    "supported_python_versions": ("Python versions the release notes list as supported", "string"),
    "supports_arm64": ("Whether a native arm64 build is published for this version", "boolean"),
    "minimum_openssl_version": ("Minimum OpenSSL version required by this version", "string"),
    "max_pages_per_document": ("Maximum pages the tool processes per document, as documented", "number"),
    "supported_input_formats": ("Comma-separated input formats the tool documents", "string"),
}

def slug(x): return x.lower().replace(" ", "-").replace(".", "-")

def pack_request(entities, fields, cid, url_for):
    return {"schema_version": "1.0.0", "task_id": f"pack-{cid.lower()}", "fixture_only": False,
            "data_classification": "PUBLIC_NON_SENSITIVE",
            "source_policy": {"mode": "INDEPENDENT_PUBLIC_RETRIEVAL", "allowed_sources": [url_for(e) for e in entities],
                              "version_scope": "Each entity as documented on the as_of date", "as_of": AS_OF,
                              "minimum_locations_per_item": 1, "max_search_actions_per_item": 3,
                              "access_failure_policy": "LOG_LIMITATION_DO_NOT_FABRICATE"},
            "entities": [{"entity_id": slug(e), "name": e} for e in entities],
            "fields": [{"field_id": f, "definition": FIELDS[f][0], "value_type": FIELDS[f][1]} for f in fields]}

releases = lambda e: f"https://{slug(e)}.example/releases"
docs = lambda e: f"https://docs.{slug(e)}.example/reference"
SDKS = [f"{t.split()[0]} SDK" for t in TOOLS]
VERSIONED = ["Tessel Auth SDK 5.0", "Tessel Auth SDK 5.1", "Larkspur Storage SDK 1.7", "Larkspur Storage SDK 1.8"]
READERS = ["Folio Reader", "Glyph Extract", "Margin Parse", "Quire Scan"]
REALISTIC = {  # item counts stated by each authored prompt; holdouts reuse their source case
    'P01': lambda c: claims_request(18, c, vendors=VENDORS[:3]),
    'P02': lambda c: pack_request(TOOLS[:8], ['latest_stable_release_date'], c, releases),
    'P03': lambda c: claims_request(12, c, "PROVIDED_CORPUS", VENDORS[:2]),
    'P04': lambda c: pack_request(TOOLS[:6], ['latest_stable_version', 'license_spdx', 'minimum_runtime', 'primary_language', 'latest_stable_release_date'], c, releases),
    'P05': lambda c: claims_request(20, c, "PROVIDED_CORPUS"),
    'P06': lambda c: pack_request(SDKS, ['max_request_size_bytes', 'supports_http2', 'minimum_tls_version'], c, docs),
    'P07': lambda c: claims_request(6, c, vendors=VENDORS[2:3]),
    'P08': lambda c: pack_request(VERSIONED, ['supported_python_versions', 'supports_arm64', 'minimum_openssl_version'], c, docs),
    'P09': lambda c: claims_request(15, c, vendors=VENDORS[:3]),
    'P10': lambda c: pack_request(READERS, ['max_pages_per_document', 'supported_input_formats'], c, docs),
    'B02': lambda c: claims_request(10, c, vendors=VENDORS[1:3]),
    'B07': lambda c: pack_request(SDKS[:3], ['max_request_size_bytes', 'supports_http2', 'minimum_tls_version'], c, docs),
    'B08': lambda c: claims_request(5, c, vendors=VENDORS[3:4]),
    'B10': lambda c: claims_request(5, c, vendors=VENDORS[:1]),
}

manifest = []
for c in cases:
    key = c.get('source_case') or c['id']
    parts = [c['prompt']]
    if c.get('owner_context'):
        parts.append("Owner context: " + c['owner_context'])
    if c.get('fixture_request'):
        req = REALISTIC[key](c['id']) if key in REALISTIC else json.load(open(os.path.join(SKILL, c['fixture_request'])))
        parts.append("Attached request (request.json):\n```json\n" + json.dumps(req, indent=2) + "\n```")
    open(os.path.join(out_dir, c['id'] + '.txt'), 'w').write("\n\n".join(parts) + "\n")
    manifest.append({k: c.get(k) for k in ('id', 'group', 'source_case', 'expected_decision', 'expected_template', 'expected_zero_mutations', 'fixture_request')})
json.dump(manifest, open(os.path.join(out_dir, 'manifest.json'), 'w'), indent=1)
print(len(manifest), 'messages in', out_dir)
