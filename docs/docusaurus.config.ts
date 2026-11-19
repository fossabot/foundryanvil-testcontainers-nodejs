import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";
import {
  githubSourceUrl,
  REPO_ROOT,
  REPOSITORY_URL,
} from "./plugins/snippets/project.mts";
import remarkSnippets, {
  type RemarkSnippetsOptions,
} from "./plugins/snippets/remark-snippets.mts";

const PACKAGE = "@hellaweb3/foundryanvil-testcontainers-nodejs";

// GitHub Pages: the deploy workflow passes the Pages URL (empty = unset);
// the defaults match https://hella-labs.github.io/foundryanvil-testcontainers-nodejs/.
const url = process.env.DOCS_URL || "https://hella-labs.github.io";
const baseUrl =
  process.env.DOCS_BASE_URL || "/foundryanvil-testcontainers-nodejs/";

const snippets: RemarkSnippetsOptions = {
  repoRoot: REPO_ROOT,
  // `docusaurus start` shows the current regions (a page picks up an edited
  // example when it recompiles); builds fail on stale samples instead.
  onStale: process.env.NODE_ENV === "development" ? "update" : "error",
  sourceUrl: (region) => githubSourceUrl(region),
};

const config: Config = {
  title: "Foundry Anvil Testcontainers",
  tagline:
    "Real anvil nodes for Node.js tests: every flag type-safe and validated, with a pre-configured viem test client.",
  favicon: "img/favicon.svg",
  url,
  baseUrl: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  organizationName: "hella-labs",
  projectName: "foundryanvil-testcontainers-nodejs",
  trailingSlash: false,

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  onDuplicateRoutes: "throw",
  markdown: {
    // .md is CommonMark (readable on GitHub), .mdx is MDX.
    format: "detect",
    hooks: { onBrokenMarkdownLinks: "throw" },
  },

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          path: "content",
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
          editUrl: `${REPOSITORY_URL}/edit/main/docs/`,
          remarkPlugins: [[remarkSnippets, snippets]],
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: "Anvil Testcontainers",
      logo: { alt: "Anvil Testcontainers", src: "img/logo.svg" },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tasks",
          position: "left",
          label: "Tasks",
        },
        {
          type: "docSidebar",
          sidebarId: "reference",
          position: "left",
          label: "Reference",
        },
        {
          type: "docSidebar",
          sidebarId: "deepDives",
          position: "left",
          label: "Deep dives",
        },
        {
          href: `https://www.npmjs.com/package/${PACKAGE}`,
          label: "npm",
          position: "right",
        },
        { href: REPOSITORY_URL, label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Quick start", to: "/docs/get-started/quick-start" },
            { label: "Tasks", to: "/docs" },
            { label: "Reference", to: "/docs/reference" },
            { label: "Deep dives", to: "/docs/deep-dives" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: REPOSITORY_URL },
            { label: "Examples", href: `${REPOSITORY_URL}/tree/main/examples` },
            {
              label: "Changelog",
              href: `${REPOSITORY_URL}/blob/main/CHANGELOG.md`,
            },
            { label: "npm", href: `https://www.npmjs.com/package/${PACKAGE}` },
          ],
        },
        {
          title: "Upstream",
          items: [
            {
              label: "Foundry Anvil",
              href: "https://getfoundry.sh/anvil/overview",
            },
            { label: "viem", href: "https://viem.sh" },
            { label: "Testcontainers", href: "https://testcontainers.com" },
          ],
        },
      ],
      copyright: `MIT · Maintained by <a href="https://hellalabs.dev/">Hella Labs</a>`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
