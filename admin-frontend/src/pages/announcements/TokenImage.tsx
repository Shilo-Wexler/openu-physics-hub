/** An announcement's image inside the console. A draft's image is not public, and an img tag cannot send
    the token, so the bytes are fetched with it and shown from a local object URL. */

import { useEffect, useState } from "react";

import { loadAnnouncementImage, type AnnouncementImage } from "../../api/announcements";
import { isAbort } from "../../api/client";
import { useAdmin } from "../admin/context";

interface Props {
  image: AnnouncementImage;
  /** Sizes the image, and the empty box shown while it loads. */
  className?: string;
  /** Empty when the image only decorates a row that already names the announcement. */
  alt?: string;
}

export default function TokenImage({ image, className, alt }: Props) {
  const { token } = useAdmin();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    loadAnnouncementImage(token, image, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) console.error(error);
      });
    // The object URL holds the bytes in memory until it is released.
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // image.url changes whenever the image does (?v=), so it is the only part that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, image.url]);

  if (!src) return <span className={className} aria-hidden="true" />;
  return (
    <img
      className={className}
      src={src}
      width={image.width}
      height={image.height}
      alt={alt ?? image.alt}
    />
  );
}
