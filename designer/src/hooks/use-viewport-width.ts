import { useEffect, useState } from 'react';

function readWidth() {
  return typeof window === 'undefined' ? 0 : window.innerWidth;
}

export function useViewportWidth() {
  const [width, setWidth] = useState(readWidth);

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
}
