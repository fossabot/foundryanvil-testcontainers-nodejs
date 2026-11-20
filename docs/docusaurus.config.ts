import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";
import { githubSourceUrl, REPO_ROOT } from "./plugins/snippets/project.mts";
import remarkSnippets, {
  type RemarkSnippetsOptions,
} from "./plugins/snippets/remark-snippets.mts";
import {
  BASE_URL,
  DEFAULT_BRANCH,
  NPM_URL,
  ORGANIZATION,
  PACKAGE_NAME,
  PROJECT,
  REPOSITORY_URL,
  SITE_URL,
} from "./src/lib/site.mts";

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
  // Served from hellalabs.dev (src/lib/site.mts): every URL in one place.
  url: SITE_URL,
  baseUrl: BASE_URL,
  organizationName: ORGANIZATION,
  projectName: PROJECT,
  // GitHub Pages serves `/page` from `page.html`: no trailing slashes, no redirects.
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
          editUrl: `${REPOSITORY_URL}/edit/${DEFAULT_BRANCH}/docs/`,
          remarkPlugins: [[remarkSnippets, snippets]],
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    // Generates /llms.txt and /llms-full.txt (https://llmstxt.org) for LLMs and AI tools.
    [
      "docusaurus-plugin-llms",
      { docsDir: "content", generateLLMsTxt: true, generateLLMsFullTxt: true },
    ],
  ],

  themeConfig: {
    // Dark by default, like hellalabs.dev; the toggle still switches and remembers the choice.
    colorMode: { defaultMode: "dark", respectPrefersColorScheme: false },
    docs: { sidebar: { hideable: true } },
    navbar: {
      title: "Anvil Testcontainers",
      logo: { alt: "Anvil Testcontainers logo", src: "img/logo.svg" },
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
          href: NPM_URL,
          label: "npm",
          position: "right",
        },
        { href: REPOSITORY_URL, label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "light",
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
            {
              label: "Examples",
              href: `${REPOSITORY_URL}/tree/${DEFAULT_BRANCH}/examples`,
            },
            {
              label: "Changelog",
              href: `${REPOSITORY_URL}/blob/${DEFAULT_BRANCH}/CHANGELOG.md`,
            },
            { label: "npm", href: NPM_URL },
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
        {
          title: "Machine-readable",
          items: [
            // pathname:// links point at generated static files, not client-side routes.
            { label: "Sitemap", href: "pathname:///sitemap.xml" },
            { label: "llms.txt", href: "pathname:///llms.txt" },
            { label: "llms-full.txt", href: "pathname:///llms-full.txt" },
          ],
        },
      ],
      copyright: `${PACKAGE_NAME} – MIT licensed. Maintained by <a href="https://hellalabs.dev/">Hella Labs</a>.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.nightOwl,
      additionalLanguages: ["bash"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
