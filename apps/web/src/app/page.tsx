import { PACKAGE_NAME } from "@event-ticketing/shared";
import styles from "./page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>EventTicketing</h1>
          <p>
            Monorepo scaffold is ready. Shared package:{" "}
            <code className={styles.code}>{PACKAGE_NAME}</code>
          </p>
          <p>
            API base URL: <code className={styles.code}>{apiUrl}</code>
          </p>
        </div>
      </main>
    </div>
  );
}
