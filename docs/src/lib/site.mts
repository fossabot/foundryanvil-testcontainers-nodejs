/**
 * Where things are: the site's URLs, the repository and the package. The single source for the
 * docs config, the plugins, the scripts and the tests.
 */
export const ORGANIZATION = "hella-labs";
export const PROJECT = "foundryanvil-testcontainers-nodejs";
export const PACKAGE_NAME = "@hellaweb3/foundryanvil-testcontainers-nodejs";

// GitHub Pages URL
//export const SITE_URL = `https://${ORGANIZATION}.github.io`;

// Cloudflare docs reverse proxy path served docs
export const SITE_URL = `https://hellalabs.dev`;

/** The path the site is served under, on GitHub Pages and behind the reverse proxy alike. */
export const BASE_URL = `/${PROJECT}/`;
/** The absolute URL of the site's home page. */
export const HOME_URL = `${SITE_URL}${BASE_URL}`;
/** The absolute URL of the docs, as source code and READMEs link to them. */
export const DOCS_URL = `${HOME_URL}docs/`;

export const REPOSITORY_URL = `https://github.com/${ORGANIZATION}/${PROJECT}`;
export const NPM_URL = `https://www.npmjs.com/package/${PACKAGE_NAME}`;
/** The branch the published docs link to. */
export const DEFAULT_BRANCH = "main";
