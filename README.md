# C4cOdataViewer

Interactive OData browser that lets you authenticate, inspect the service document/metadata, and page through entity data without writing queries manually. Resources are listed from the connected endpoint, and each entity set can be opened to display a lazy‑loaded table with sortable/filterable columns and a metadata dialog per row (the `__metadata` payload is shown on demand). Filtering is generated to comply with OData v2 semantics (e.g. `substringof`), so the viewer works against both legacy and modern OData services.

## Prerequisites

- Node.js 18+ and npm 9+
- Angular CLI `npm install -g @angular/cli` (optional but recommended)
- Credentials and base URL for the target OData service

## Getting Started

```bash
git clone <repo-url>
cd odata-viewer
npm install
```

### Configure a Connection

1. Start the dev server (see below).
2. In the login screen, enter the target service URL plus basic-auth credentials.
3. After authentication, the Resources page lists all available entity sets/function imports parsed from the service document/metadata.

### Development Server

```bash
ng serve
```

Open `http://localhost:4200/`. The app hot-reloads on source changes.

### Key Features

- **Connection management:** store the most recent OData URL + credentials during the session.
- **Resource explorer:** lists entity sets, function imports, and entity types discovered from `$metadata` or the service document.
- **Lazy data tables:** server-driven pagination that keeps large datasets responsive; includes retry logic for `$count` vs `$inlinecount`.
- **Column tooling:** each column supports sorting, filtering, and type-aware operators (numeric, boolean, date, string).
- **Metadata modal:** a “Show Metadata” action per row displays the original `__metadata` payload.
- **OData v2 compatibility:** filter strings use `substringof(...) eq true`, and unsupported functions automatically fall back to compliant options.

## Common Scripts

| Command      | Description |
|--------------|-------------|
| `ng serve`   | Runs the dev server on `http://localhost:4200/`. |
| `ng build`   | Produces an optimized production bundle under `dist/`. |
| `ng test`    | Executes unit tests via Karma. |

> Need another Angular CLI schematic? Run `ng generate --help` for a full command reference.

## Troubleshooting

- **`$count` not supported:** The table automatically retries with `$inlinecount=allpages`, then falls back to estimate totals if neither is available.
- **Invalid filter functions:** Filters are generated using OData v2 rules. If your service enforces additional constraints (for example case-sensitive field names), adjust the filter options within `ResourceDataComponent`.

## Additional Resources

- [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli)
- [OData v2 Protocol Guide](https://www.odata.org/documentation/odata-version-2-0/)
