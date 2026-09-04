import { getLogoPx } from "../../constants";

interface DocLogoProps {
  src: string | null | undefined;
  alt: string;
  logoSize: string | null | undefined;
  /** Banner mode (company name hidden) allows a larger guarded box. */
  banner?: boolean;
  /** Modern template stacking variant. */
  modern?: boolean;
}

/**
 * Shared print logo. Width comes from the logo_size preset; height is
 * guarded by CSS (max-height + object-fit: contain) so wide typo/wordmark
 * logos stay clean and never push the header tall.
 */
export function DocLogo({ src, alt, logoSize, banner = false, modern = false }: DocLogoProps) {
  if (!src) return null;
  const cls = modern
    ? `print-logo-img print-logo-img--modern${banner ? " print-logo-img--banner" : ""}`
    : `print-classic-logo-img${banner ? " print-logo-img--banner" : ""}`;
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: getLogoPx(logoSize) }}
      className={cls}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}
