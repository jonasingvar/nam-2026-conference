import { compileDeclarativeMatchers, type DeepsecPlugin } from "deepsec/config";

const specs = [
  {
    "version": 1,
    "slug": "esm-cli-main-guard",
    "description": "Node ESM CLI scripts in this repo that gate their main() behind the invoked-directly check (process.argv[1] resolved against fileURLToPath(import.meta.url), or the lane.mjs endsWith variant). This is the concrete registration primitive of the local dev/CI command-line tooling: argument parsing, git/gh subprocesses and test-suite execution all hang off this guard.",
    "noiseTier": "precise",
    "filePatterns": [
      "scripts/*.mjs",
      "server/*.js"
    ],
    "requires": {
      "tech": [
        "node"
      ],
      "sentinelFiles": [
        "package.json"
      ]
    },
    "patterns": [
      {
        "source": "process\\.argv\\[1\\][^\\n]*fileURLToPath\\(import\\.meta\\.url\\)",
        "label": "ESM invoked-directly main guard (resolve(argv[1]) === fileURLToPath(import.meta.url))"
      },
      {
        "source": "process\\.argv\\[1\\]\\?\\.endsWith\\('[^']+\\.mjs'\\)",
        "label": "ESM invoked-directly guard via argv[1] filename suffix"
      }
    ],
    "excludeFilePatterns": [
      "tests/**",
      "node_modules/**"
    ],
    "examples": [
      "if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {",
      "const invokedDirectly = process.argv[1]?.endsWith('lane.mjs');"
    ],
    "closesSurfaceIds": [
      "dev-cli-scripts"
    ]
  },
  {
    "version": 1,
    "slug": "cli-top-level-argv-parse",
    "description": "Repo dev scripts that parse process.argv.slice(2) into a top-level const at module scope (no main guard): these run their command logic — GitHub media uploads, Playwright screenshot capture, avatar downloads — on every direct invocation. Scoped to the scripts/ directory so it stays on the dev-CLI surface.",
    "noiseTier": "normal",
    "filePatterns": [
      "scripts/*.mjs"
    ],
    "requires": {
      "tech": [
        "node"
      ],
      "sentinelFiles": [
        "package.json"
      ]
    },
    "patterns": [
      {
        "source": "^const\\s+[^\\n=]+=\\s*process\\.argv\\.slice\\(2\\)",
        "flags": "m",
        "label": "top-level CLI argument parsing from process.argv.slice(2)"
      }
    ],
    "excludeFilePatterns": [
      "tests/**",
      "node_modules/**"
    ],
    "examples": [
      "const args = process.argv.slice(2);",
      "const [issue, ...files] = process.argv.slice(2);"
    ],
    "closesSurfaceIds": [
      "dev-cli-scripts"
    ]
  },
  {
    "version": 1,
    "slug": "db-seed-publish-cli",
    "description": "The two database seeding scripts: server/seed.js (imports dropAll/migrate from ./db.js and rebuilds the local conference database) and server/publish-seed.js (pushes the seed to production Turso when TURSO_DATABASE_URL is set at build time). Narrow file scope plus anchored primitives: destructive schema rebuild and production-publish credential use.",
    "noiseTier": "precise",
    "filePatterns": [
      "server/seed.js",
      "server/publish-seed.js"
    ],
    "requires": {
      "tech": [
        "node"
      ],
      "sentinelFiles": [
        "server/db.js"
      ]
    },
    "patterns": [
      {
        "source": "\\{[^}]*dropAll[^}]*\\}\\s*from\\s*'\\./db\\.js'",
        "label": "seed script importing the destructive dropAll/migrate primitives from db.js"
      },
      {
        "source": "process\\.env\\.TURSO_DATABASE_URL",
        "label": "production Turso publish gated on TURSO_DATABASE_URL"
      }
    ],
    "examples": [
      "import { db, migrate, dropAll, DB_PATH } from './db.js';",
      "const url = process.env.TURSO_DATABASE_URL;"
    ],
    "closesSurfaceIds": [
      "dev-cli-scripts"
    ]
  }
];

export const generatedMatchersPlugin: DeepsecPlugin = {
  name: "deepsec-generated-matchers",
  matchers: compileDeclarativeMatchers(specs),
};
