import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const SCROLL_THRESHOLD_PX = 600;

export function CatalogueScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > SCROLL_THRESHOLD_PX);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // `T` shortcut — only active while the button itself is visible, so
  // it doesn't hijack the key at the top of the page where there's
  // nothing to scroll back to. Matches the existing C/V/L/I/S/U
  // single-letter family on the catalogue page.
  useEffect(() => {
    if (!visible) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 't' && event.key !== 'T') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible]);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!visible) return null;

  return (
    <button
      type="button"
      className="catalogue-scroll-top"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      title="Scroll to top (T)"
    >
      <ArrowUp size={18} strokeWidth={2.2} />
    </button>
  );
}
