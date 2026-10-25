# Public benchmark viewer

## Architecture decision

The viewer is a separate Next.js App Router application in `viewer/`, built with
the repository's existing Next/React/TypeScript toolchain and exported as static
files. It imports the public-format validator and manifest verifier from
`src/lib/public-benchmark.ts`; this keeps the viewer independent of the Ollama
dashboard while reusing the canonical `benchmark-public/v1` rules. A separate
`viewer/next.config.ts` owns static export and optional `VIEWER_BASE_PATH`; the
root Next.js configuration is unchanged and continues to serve the local
Ollama application.

The viewer has no server routes, API endpoints, persistence, credentials, or
upload path. A user-selected JSON/manifest pair is read and checked in the
browser, then kept in component memory only. The versioned catalog is a
reviewed, checked-in list of static file paths; a maintainer registration
command validates the exact input bytes and manifest before copying the pair
and adding an entry. That command never commits or pushes. The initial catalog
contains only the existing synthetic sample.

## Trust and comparison boundaries

Schema validation establishes format conformance, and manifest verification
establishes byte equality with the supplied manifest only. Neither proves
authenticity, measurement accuracy, independent review, or safe publication.
Catalog changes require human review. The UI labels user-recorded data as
unverified and marks synthetic samples separately.

Comparison classification uses only fields disclosed in each record. It does
not require `conditions.id` equality: that fingerprint includes model identity
and is not a model-independent match criterion. Different task IDs/versions,
rubric IDs/versions, criterion IDs/labels/descriptions/scoring methods/maximum
scores, or known settings and hardware are reported as condition differences.
Withheld criterion descriptions and other missing values remain unknown and
cannot establish equivalence. Scores are not aggregated across different tasks
or rubrics; unobserved measurements are not plotted as zero.

## Local development and static build

```powershell
npm run viewer:dev
npm run viewer:build
```

The static export is written under `viewer/out/`; it is not used to change the
root Next.js build. For a host mounted at a subpath, set `VIEWER_BASE_PATH` to
that path at build time. The export contains only the viewer, its reviewed
catalog, and catalogued JSON/manifest files. Do not place local result data,
environment files, or private research material in `viewer/public/`.

The PR CI builds and inspects this export but does not deploy it. Any future
hosting workflow must be separately reviewed and explicitly enabled.

## Registering reviewed data

1. Review the source JSON and preview its complete contents outside the
   registration command. Remove secrets, private paths, private task material,
   and raw logs. The scanner is not a complete safety boundary.
2. Provide the exact exported `benchmark-public/v1` JSON and its
   `benchmark-public-manifest/v1` manifest. Verify the manifest against the
   exact UTF-8 file bytes.
3. Run the registration tool with a new stable catalog ID, an explicit review
   note, and both file paths. The tool validates schema, disclosure scan,
   manifest bytes, size, duplicate IDs, and catalog uniqueness before copying
   the files. It accepts only data that has been explicitly reviewed; it does
   not infer approval from a valid hash.
4. Inspect the staged catalog and copied data, run `npm run check` and
   `npm run viewer:build`, and review the complete diff and static output before
   a human makes any commit or publication decision.

No real-world user-recorded benchmark is included in this stage.

## Security and limitations

JSON values are rendered as text, never trusted HTML. External links are
restricted to public HTTP(S) URLs without credentials or sensitive query
parameters and use `rel="noopener noreferrer"`. The validator rejects
malformed structures and unsafe content before display. Browser file input
does not upload selected files; no fetch to an external origin is made.

Static hosting makes catalogued files public to anyone who can access the
site. A checked-in catalog or a hash cannot substitute for publication review.
The static export is checked for environment files, internal API routes, and
uncatalogued JSON. `none_detected` does not prove absence of information
contamination. Authenticity would require a separate trusted signing or
attestation mechanism, which is out of scope.
