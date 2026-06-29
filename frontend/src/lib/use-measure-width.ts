import { useEffect, useRef, useState } from "react";

/**
 * Наблюдает за шириной контейнера и сообщает её в `width` как целое число.
 * Используется в header для динамического сокрытия пунктов навигации,
 * которые не помещаются, и для защиты от переполнения.
 */
export function useMeasureWidth<T extends HTMLElement>(): [
  React.RefObject<T>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setWidth(Math.round(r.width));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return [ref, width];
}
