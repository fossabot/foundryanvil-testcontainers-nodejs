import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Heading from "@theme/Heading";
import Layout from "@theme/Layout";
import type { ReactNode } from "react";
import styles from "./index.module.css";
import { TASKS } from "../data/tasks";

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <header className={`hero hero--dark ${styles.hero}`}>
        <div className="container">
          <Heading as="h1" className="hero__title">
            {siteConfig.title}
          </Heading>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link
              className="button button--primary button--lg"
              to="/docs/get-started/quick-start"
            >
              Quick start
            </Link>
            <Link className="button button--secondary button--lg" to="/docs">
              Browse tasks
            </Link>
          </div>
          <code className={styles.install}>
            pnpm add -D @hellaweb3/foundryanvil-testcontainers-nodejs
          </code>
        </div>
      </header>
      <main className={`container ${styles.tasks}`}>
        <Heading as="h2">What do you want to do?</Heading>
        <div className={styles.grid}>
          {TASKS.map((task) => (
            <Link key={task.to} to={task.to} className={styles.card}>
              <Heading as="h3">{task.title}</Heading>
              <p>{task.description}</p>
            </Link>
          ))}
        </div>
        <p className={styles.tested}>
          Every code sample on this site is copied from an example that runs
          against a real anvil node in CI.{" "}
          <Link to="/docs/deep-dives/tested-docs">How the docs are tested</Link>
        </p>
      </main>
    </Layout>
  );
}
