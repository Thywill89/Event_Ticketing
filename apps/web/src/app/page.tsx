import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import styles from "./page.module.css";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=2400&q=80";

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <SiteHeader tone="overlay" />
        <div className={styles.heroMedia} aria-hidden>
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.heroImage}
          />
          <div className={styles.heroScrim} />
          <div className={styles.heroGrain} />
        </div>
        <div className={styles.heroInner}>
          <h1 className={styles.brand}>EventMe</h1>
          <p className={styles.headline}>The door opens when the ticket does.</p>
          <p className={styles.support}>
            Browse live events and buy as a guest—no account required.
          </p>
          <div className={styles.ctas}>
            <Link href="/events" className={styles.ctaPrimary}>
              Browse events
            </Link>
            <Link href="/login" className={styles.ctaSecondary}>
              Create First Event
            </Link>
          </div>
        </div>
      </div>

      <section className={styles.band} aria-label="How it works">
        <div className={styles.bandBlock}>
          <p className={styles.bandEyebrow}>For attendees</p>
          <h2 className={styles.bandTitle}>Pick a show. Pay. Walk in.</h2>
          <p className={styles.bandCopy}>
            Browse what&apos;s live, checkout in minutes, and bring your ticket
            QR to the door.
          </p>
          <Link href="/events" className={styles.bandLink}>
            See what&apos;s on
          </Link>
        </div>
        <div className={styles.bandBlock}>
          <p className={styles.bandEyebrow}>For organizers</p>
          <h2 className={styles.bandTitle}>
            Listings, staff, and door check-in—one desk.
          </h2>
          <p className={styles.bandCopy}>
            Publish events, manage ticket types, and scan arrivals without
            juggling separate tools.
          </p>
          <Link href="/login" className={styles.bandLink}>
            Sign in to organize
          </Link>
        </div>
      </section>
    </div>
  );
}
