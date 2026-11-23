import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import CodeBlock from "@theme/CodeBlock";
import Heading from "@theme/Heading";
import Layout from "@theme/Layout";
import TabItem from "@theme/TabItem";
import Tabs from "@theme/Tabs";
import type { ReactNode } from "react";
import styles from "./index.module.css";
import { TASKS } from "../data/tasks";
import { PACKAGE_NAME } from "../lib/site.mts";

function Hero(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={`hero ${styles.hero}`}>
      <div className="container">
        <Heading as="h1" className={styles.title}>
          <span className="text-gradient">{siteConfig.title}</span>
        </Heading>
        <p className={styles.tagline}>{siteConfig.tagline}</p>
        <div className={styles.badges}>
          <a
            href="https://codecov.io/gh/hella-labs/foundryanvil-testcontainers-nodejs"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="https://codecov.io/gh/hella-labs/foundryanvil-testcontainers-nodejs/graph/badge.svg?token=WU523RPLO1"
              alt="codecov"
              height={20}
            />
          </a>
        </div>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/get-started/quick-start"
          >
            Quick start
          </Link>
          <Link className="button button--light button--lg" to="/docs">
            Browse tasks
          </Link>
        </div>
        <div className={styles.install}>
          <Tabs groupId="package-manager">
            <TabItem value="pnpm" label="pnpm" default>
              <CodeBlock language="bash">{`pnpm add -D ${PACKAGE_NAME}`}</CodeBlock>
            </TabItem>
            <TabItem value="npm" label="npm">
              <CodeBlock language="bash">{`npm install --save-dev ${PACKAGE_NAME}`}</CodeBlock>
            </TabItem>
            <TabItem value="yarn" label="yarn">
              <CodeBlock language="bash">{`yarn add --dev ${PACKAGE_NAME}`}</CodeBlock>
            </TabItem>
          </Tabs>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <Hero />
      <main className="container margin-vert--xl">
        <Heading as="h2" className={styles.sectionTitle}>
          What do you want to do?
        </Heading>
        <section className={styles.features}>
          {TASKS.map((task) => (
            <Link key={task.to} to={task.to} className={styles.feature}>
              <Heading as="h3">{task.title}</Heading>
              <p>{task.description}</p>
            </Link>
          ))}
        </section>
        <p className={styles.tested}>
          Every code sample on this site is copied from an example that runs
          against a real anvil node in CI.{" "}
          <Link to="/docs/concepts/tested-docs">How the docs are tested</Link>
        </p>
        <div className={styles.emblem}>
          <a
            href="https://www.getfoundry.sh/anvil"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={useBaseUrl("/img/foundry-hero.jpg")}
              alt="Foundry"
              width={146}
              height={73}
              loading="lazy"
            />
            <span className={styles.emblemCaption}>Built on Foundry Anvil</span>
          </a>
        </div>
      </main>
    </Layout>
  );
}
