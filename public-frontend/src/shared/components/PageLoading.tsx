import styles from "./PageLoading.module.css";

/** Holds the page's place while its code downloads (a lazy route opened directly),
    so the footer does not jump up and back down. Shows nothing: it is usually there for a moment. */
export default function PageLoading() {
  return <div className={styles.loading} aria-busy="true" />;
}