import styles from "./PageLoading.module.css";

/** Holds the screen's place while its code downloads (a lazy screen opened directly),
    so nothing below jumps up and back down. Shows nothing: it is usually there for a moment. */
export default function PageLoading() {
  return <div className={styles.loading} aria-busy="true" />;
}